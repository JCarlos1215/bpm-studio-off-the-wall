"""Web adapter for stemd, local or behind an authenticated HTTPS gateway."""
import os
import re
import struct
import hmac
import hashlib
import time
import array
import sys
import subprocess
import tempfile
import threading
from pathlib import Path

import requests
from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context
from werkzeug.exceptions import HTTPException

ROOT = Path(__file__).resolve().parent
STEMD = os.getenv('STEMD_URL', 'http://127.0.0.1:8420').rstrip('/')
ORIGINS = {'https://jcarlos1215.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080',
           'http://127.0.0.1:8421', 'http://localhost:8421'}
STEMS = {'vocals', 'drums', 'harmonics'}
REMOTE = os.getenv('STEMS_REMOTE', 'false').lower() == 'true'
SECRET = os.getenv('STEMS_ACCESS_TOKEN', '')
if REMOTE and len(SECRET) < 32:
    raise RuntimeError('STEMS_ACCESS_TOKEN debe tener al menos 32 caracteres.')
ORIGINS.update(filter(None, os.getenv('STEMS_ALLOWED_ORIGINS', '').split(',')))
UPLOAD_LOCK = threading.Lock()
app = Flask(__name__, static_folder=None)
app.config['MAX_CONTENT_LENGTH'] = 212 * 1024 * 1024
app.config['TRUSTED_HOSTS'] = os.getenv('STEMS_TRUSTED_HOSTS', 'localhost,127.0.0.1,[::1]').split(',')


@app.before_request
def guard():
    origin = request.headers.get('Origin')
    if origin and origin not in ORIGINS and origin != request.host_url.rstrip('/'):
        return jsonify(error='Origen no permitido.'), 403
    if request.method == 'OPTIONS':
        return '', 204
    if REMOTE and request.path.startswith('/api/'):
        supplied = request.headers.get('Authorization', '')
        signed_stem = request.method == 'GET' and re.fullmatch(r'/api/jobs/[A-Za-z0-9._-]{1,31}/stems/(vocals|drums|harmonics)', request.path) and valid_signature()
        if not signed_stem and not hmac.compare_digest(supplied.encode(), ('Bearer ' + SECRET).encode()):
            return jsonify(error='Introduce la clave de acceso del servidor.'), 401
    if request.method in ('POST', 'DELETE') and request.headers.get('X-Requested-With') != 'StemsStudio':
        return jsonify(error='Solicitud no permitida.'), 403


@app.after_request
def headers(response):
    origin = request.headers.get('Origin')
    if origin in ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Vary'] = 'Origin'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Requested-With, Authorization'
        response.headers['Access-Control-Expose-Headers'] = 'Content-Disposition'
        response.headers['Access-Control-Allow-Private-Network'] = 'true'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Content-Security-Policy'] = "frame-ancestors 'self' https://jcarlos1215.github.io http://127.0.0.1:8080 http://localhost:8080"
    return response


@app.errorhandler(Exception)
def error(exc):
    if isinstance(exc, HTTPException):
        return jsonify(error=exc.description), exc.code
    if isinstance(exc, requests.RequestException):
        return jsonify(error='El motor stemd no está disponible. Comprueba el servidor.'), 503
    app.logger.exception('stemd bridge failed')
    return jsonify(error='No se pudo procesar la separación.'), 500


def upstream(method, path, **kwargs):
    response = requests.request(method, STEMD + path, timeout=(5, 60), allow_redirects=False, **kwargs)
    if response.status_code >= 400:
        try:
            message = response.json().get('error', 'El motor rechazó la solicitud.')
        except ValueError:
            message = 'El motor rechazó la solicitud.'
        from werkzeug.exceptions import abort
        abort(response.status_code, description=message)
    return response


def job_id(identifier):
    if identifier in {'.', '..'} or not re.fullmatch(r'[A-Za-z0-9._-]{1,31}', identifier):
        from werkzeug.exceptions import abort
        abort(400, description='Identificador no válido.')
    return identifier


def public(data):
    if isinstance(data, dict):
        return {key: public(value) for key, value in data.items() if key != 'path'}
    if isinstance(data, list):
        return [public(value) for value in data]
    return data


def signature(path, expiry):
    return hmac.new(SECRET.encode(), f'{path}:{expiry}'.encode(), hashlib.sha256).hexdigest()


def valid_signature():
    try:
        expiry = int(request.args.get('expires', '0'))
    except ValueError:
        return False
    return time.time() < expiry <= time.time() + 3601 and hmac.compare_digest(
        signature(request.path, expiry), request.args.get('signature', ''))


@app.get('/')
def home():
    return send_from_directory(ROOT, 'index.html')


@app.get('/<name>')
def asset(name):
    if name not in {'app.js', 'style.css'}:
        from werkzeug.exceptions import abort
        abort(404)
    return send_from_directory(ROOT, name)


@app.get('/api/health')
def health():
    data = public(upstream('GET', '/v1/health').json())
    data['remote'] = REMOTE
    return jsonify(data)


@app.get('/ready')
def ready():
    # Public readiness reveals no model, job, or filesystem information.
    upstream('GET', '/v1/health')
    return jsonify(ready=True)


@app.post('/api/files')
def create_file():
    """Decode uploaded audio on the server to avoid large browser PCM buffers."""
    if not UPLOAD_LOCK.acquire(blocking=False):
        return jsonify(error='Hay otra subida en curso. Espera antes de reintentar.'), 429
    try:
        with tempfile.TemporaryDirectory(prefix='stems-upload-') as directory:
            source = Path(directory) / 'source'
            output = Path(directory) / 'audio.pcm'
            with source.open('wb') as stream:
                while chunk := request.stream.read(65536):
                    stream.write(chunk)
            if not source.stat().st_size:
                return jsonify(error='El archivo está vacío.'), 400
            try:
                subprocess.run([os.getenv('FFMPEG_BINARY', 'ffmpeg'), '-nostdin', '-hide_banner', '-loglevel', 'error',
                                '-protocol_whitelist', 'file,pipe', '-i', str(source),
                                '-map', '0:a:0', '-t', '600.01', '-ac', '2', '-ar', '44100',
                                '-f', 'f32le', str(output)], check=True, timeout=120,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                return jsonify(error='No se pudo leer el audio. Usa WAV, FLAC, MP3 o M4A.'), 400
            if not output.stat().st_size or output.stat().st_size > 44100 * 8 * 600:
                return jsonify(error='Selecciona una pista de hasta diez minutos.'), 400
            with output.open('rb') as audio:
                response = submit(audio)
            return jsonify(public(response.json())), response.status_code
    finally:
        UPLOAD_LOCK.release()


@app.post('/api/jobs')
def create():
    # Only one lossless protocol is exposed; never forward arbitrary query parameters.
    payload = request.get_data()
    if not payload or len(payload) % 8 or len(payload) > 44100 * 2 * 4 * 600:
        return jsonify(error='Audio vacío, incompleto o superior a diez minutos.'), 400
    response = submit(payload)
    return jsonify(public(response.json())), response.status_code


def submit(payload):
    return upstream('POST', '/v1/jobs', data=payload,
                        headers={'Content-Type': 'application/octet-stream'},
                        params={'sample_rate':44100, 'channels':2, 'format':'f32le',
                                'output_format':'pcm32', 'output_sample_rate':44100,
                                'include_derived':'true', 'dsp_mode':0})


@app.get('/api/jobs/<identifier>')
def job(identifier):
    identifier = job_id(identifier)
    data = public(upstream('GET', '/v1/jobs/' + identifier).json())
    if REMOTE and data.get('progress', {}).get('stage') == 'done':
        expiry = int(time.time()) + 3600
        for item in data.get('result', {}).get('stems', []):
            if item.get('name') in STEMS:
                path = f'/api/jobs/{identifier}/stems/{item["name"]}'
                item['download_url'] = f'{path}?expires={expiry}&signature={signature(path, expiry)}'
    return jsonify(data)


@app.get('/api/jobs/<identifier>/peaks/<name>')
def peaks(identifier, name):
    identifier = job_id(identifier)
    if name not in STEMS:
        from werkzeug.exceptions import abort
        abort(404)
    data = upstream('GET', '/v1/jobs/' + identifier).json()
    result = data.get('result') or {}
    if data.get('progress', {}).get('stage') != 'done' or result.get('format') != 'pcm32':
        return jsonify(error='La separación todavía no está lista.'), 409
    count = result['frames'] * result['channels']
    values = [0.0] * 700
    response = upstream('GET', f'/v1/jobs/{identifier}/stems/{name}', stream=True)
    index = 0
    pending = b''
    try:
        for chunk in response.iter_content(65536):
            pending += chunk
            complete = len(pending) // 4 * 4
            samples = array.array('f', pending[:complete])
            pending = pending[complete:]
            if sys.byteorder != 'little':
                samples.byteswap()
            offset = 0
            while offset < len(samples) and index < count:
                bin_index = min(699, index * 700 // count)
                boundary = ((bin_index + 1) * count + 699) // 700
                take = min(len(samples) - offset, boundary - index)
                segment = samples[offset:offset + take]
                values[bin_index] = max(values[bin_index], abs(min(segment)), abs(max(segment)))
                index += take
                offset += take
        if pending or index != count:
            return jsonify(error='La forma de onda llegó incompleta.'), 502
    finally:
        response.close()
    return jsonify(peaks=values)


@app.delete('/api/jobs/<identifier>')
def cancel(identifier):
    response = upstream('DELETE', '/v1/jobs/' + job_id(identifier))
    return '', response.status_code


def wav_header(frames, rate, channels):
    length = frames * channels * 4
    if not 0 < length < 0xffffffff - 36 or channels != 2 or rate != 44100:
        raise ValueError('Formato de salida inesperado.')
    return struct.pack('<4sI4s4sIHHIIHH4sI', b'RIFF', length + 36, b'WAVE', b'fmt ', 16,
                       3, channels, rate, rate * channels * 4, channels * 4, 32, b'data', length)


@app.get('/api/jobs/<identifier>/stems/<name>')
def stem(identifier, name):
    identifier = job_id(identifier)
    if name not in STEMS:
        from werkzeug.exceptions import abort
        abort(404)
    data = upstream('GET', '/v1/jobs/' + identifier).json()
    result = data.get('result') or {}
    if data.get('progress', {}).get('stage') != 'done' or result.get('format') not in {'pcm32', 'f32le'}:
        return jsonify(error='La separación todavía no está lista.'), 409
    meta = next((item for item in result.get('stems', []) if item.get('name') == name), None)
    if not meta or meta.get('gain', 1) != 1:
        return jsonify(error='Salida sin pérdida no disponible.'), 409
    header = wav_header(result['frames'], result['sample_rate'], result['channels'])
    response = upstream('GET', f'/v1/jobs/{identifier}/stems/{name}', stream=True)
    def chunks():
        try:
            yield header
            yield from response.iter_content(65536)
        finally:
            response.close()
    return Response(stream_with_context(chunks()), mimetype='audio/wav', headers={
        'Content-Disposition': f'attachment; filename="{name}.wav"',
        'Content-Length': str(44 + result['frames'] * result['channels'] * 4)})


if __name__ == '__main__':
    from waitress import serve
    serve(app, host=os.getenv('HOST', '127.0.0.1'), port=int(os.getenv('PORT', '8421')),
          threads=4, max_request_body_size=212*1024*1024)
