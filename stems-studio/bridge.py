"""Loopback-only web adapter for the official stemd v1 PCM protocol."""
import os
import re
import struct
from pathlib import Path

import requests
from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context
from werkzeug.exceptions import HTTPException

ROOT = Path(__file__).resolve().parent
STEMD = os.getenv('STEMD_URL', 'http://127.0.0.1:8420').rstrip('/')
ORIGINS = {'https://jcarlos1215.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080',
           'http://127.0.0.1:8421', 'http://localhost:8421'}
STEMS = {'vocals', 'drums', 'harmonics'}
app = Flask(__name__, static_folder=None)
app.config['MAX_CONTENT_LENGTH'] = 212 * 1024 * 1024
app.config['TRUSTED_HOSTS'] = ['localhost', '127.0.0.1', '[::1]']


@app.before_request
def guard():
    origin = request.headers.get('Origin')
    if origin and origin not in ORIGINS:
        return jsonify(error='Origen no permitido.'), 403
    if request.method == 'OPTIONS':
        return '', 204
    if request.method in ('POST', 'DELETE') and request.headers.get('X-Requested-With') != 'StemsStudio':
        return jsonify(error='Solicitud no permitida.'), 403


@app.after_request
def headers(response):
    origin = request.headers.get('Origin')
    if origin in ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Vary'] = 'Origin'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Requested-With'
        response.headers['Access-Control-Expose-Headers'] = 'Content-Disposition'
        response.headers['Access-Control-Allow-Private-Network'] = 'true'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.errorhandler(Exception)
def error(exc):
    if isinstance(exc, HTTPException):
        return jsonify(error=exc.description), exc.code
    if isinstance(exc, requests.RequestException):
        return jsonify(error='El motor stemd no está disponible. Actívalo en tu Mac.'), 503
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
    return jsonify(public(upstream('GET', '/v1/health').json()))


@app.post('/api/jobs')
def create():
    # Only one lossless protocol is exposed; never forward arbitrary query parameters.
    payload = request.get_data()
    if not payload or len(payload) % 8 or len(payload) > 44100 * 2 * 4 * 600:
        return jsonify(error='Audio vacío, incompleto o superior a diez minutos.'), 400
    response = upstream('POST', '/v1/jobs', data=payload,
                        headers={'Content-Type': 'application/octet-stream'},
                        params={'sample_rate':44100, 'channels':2, 'format':'f32le',
                                'output_format':'pcm32', 'output_sample_rate':44100,
                                'include_derived':'true', 'dsp_mode':0})
    return jsonify(public(response.json())), response.status_code


@app.get('/api/jobs/<identifier>')
def job(identifier):
    return jsonify(public(upstream('GET', '/v1/jobs/' + job_id(identifier)).json()))


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
    serve(app, host='127.0.0.1', port=8421, threads=4, max_request_body_size=212*1024*1024)
