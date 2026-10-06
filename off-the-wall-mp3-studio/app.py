import hmac
import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.env')

from flask import Flask, Response, jsonify, request, send_file
from werkzeug.exceptions import HTTPException
from engine import JobStore, readable_error
import providers


def create_app(data_dir=None):
    app = Flask(__name__, static_folder='static')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024
    public_access = os.getenv('ALLOW_PUBLIC_ACCESS', '').lower() in {'1', 'true', 'yes'}
    app.config['TRUSTED_HOSTS'] = ['localhost', '127.0.0.1', '[::1]'] if not os.getenv('APP_PASSWORD') and not public_access else None
    store = JobStore(data_dir or os.getenv('DATA_DIR') or ROOT / 'data')
    app.extensions['jobs'] = store

    @app.before_request
    def protect():
        password = os.getenv('APP_PASSWORD', '')
        if password and not public_access and request.path.startswith('/api/') and request.path != '/api/status':
            auth = request.authorization
            if not auth or not hmac.compare_digest(auth.password or '', password):
                return Response('Acceso protegido. Usa cualquier nombre de usuario y la contraseña del servidor.', 401,
                                {'WWW-Authenticate': 'Basic realm="AllToMP3 Web", charset="UTF-8"'})
        if request.method in ('POST', 'PATCH', 'DELETE'):
            origin = request.headers.get('Origin')
            if origin and urlparse(origin).netloc != request.host:
                return jsonify(error='Origen de solicitud no permitido.'), 403
            if request.headers.get('X-Requested-With') != 'AllToMP3':
                return jsonify(error='Falta la cabecera de protección de solicitudes.'), 403

    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        frame_ancestors = os.getenv(
            'MP3_STUDIO_FRAME_ANCESTORS',
            "'self' http://localhost:3000 http://127.0.0.1:3000 http://localhost:8080 http://127.0.0.1:8080",
        )
        response.headers['Content-Security-Policy'] = f"default-src 'self'; img-src 'self' https: data:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors {frame_ancestors}; base-uri 'self'; form-action 'self'"
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    @app.errorhandler(Exception)
    def error(exc):
        if isinstance(exc, HTTPException):
            return jsonify(error=exc.description), exc.code
        if isinstance(exc, KeyError):
            return jsonify(error='No se encontró esta conversión o archivo.'), 404
        if isinstance(exc, (ValueError, providers.SourceError)):
            return jsonify(error=readable_error(exc)), 400
        app.logger.exception('Request failed')
        return jsonify(error='El servidor no pudo completar esta operación.'), 500

    @app.get('/')
    def home():
        return app.send_static_file('index.html')

    @app.get('/api/status')
    def status():
        from engine import ffmpeg_path
        return jsonify(ok=True, ffmpeg=bool(Path(ffmpeg_path()).is_file()),
                       spotify_configured=bool(os.getenv('SPOTIFY_CLIENT_ID') and os.getenv('SPOTIFY_CLIENT_SECRET')),
                       playlist_limit=providers.MAX_ITEMS)

    @app.post('/api/search')
    def search():
        payload = request.get_json()
        if not isinstance(payload, dict) or not isinstance(payload.get('query'), str):
            raise ValueError('Introduce una búsqueda válida.')
        try:
            return jsonify(tracks=providers.search(payload['query']))
        except providers.SourceError:
            raise
        except Exception as exc:
            return jsonify(error=readable_error(exc)), 502

    @app.get('/api/jobs')
    def jobs():
        return jsonify(jobs=store.list())

    @app.post('/api/jobs')
    def create():
        payload = request.get_json()
        if not isinstance(payload, dict) or not isinstance(payload.get('query'), str):
            raise ValueError('Introduce un enlace o una búsqueda válida.')
        options = payload.get('options') or {}
        if not isinstance(options, dict):
            raise ValueError('Opciones no válidas.')
        bitrate = options.get('bitrate', 256)
        if type(bitrate) is not int or bitrate not in (128, 192, 256, 320):
            raise ValueError('La calidad debe ser 128, 192, 256 o 320 kbps.')
        for flag in ('tags', 'lyrics', 'playlist'):
            if flag in options and type(options[flag]) is not bool:
                raise ValueError('Opciones de conversión no válidas.')
        options = {'bitrate': bitrate, 'tags': options.get('tags', True),
                   'lyrics': options.get('lyrics', True) and options.get('tags', True),
                   'playlist': options.get('playlist', False)}
        return jsonify(job=store.create(payload['query'].strip(), options)), 202

    @app.get('/api/jobs/<identifier>')
    def job(identifier):
        return jsonify(job=store.get(identifier))

    @app.post('/api/jobs/<identifier>/cancel')
    def cancel(identifier):
        return jsonify(job=store.cancel(identifier))

    @app.post('/api/jobs/<identifier>/retry')
    def retry(identifier):
        from engine import TERMINAL
        previous = store.get(identifier)
        if previous['status'] not in TERMINAL:
            raise ValueError('La conversión todavía está en curso.')
        return jsonify(job=store.create(previous['query'], previous['options'])), 202

    @app.delete('/api/jobs/<identifier>')
    def delete(identifier):
        store.delete(identifier)
        return jsonify(ok=True)

    @app.get('/api/jobs/<identifier>/tracks/<int:index>/download')
    def download(identifier, index):
        path, name = store.track_file(identifier, index)
        return send_file(path, as_attachment=True, download_name=name, mimetype='audio/mpeg')

    @app.get('/api/jobs/<identifier>/archive')
    def archive(identifier):
        path, name = store.archive(identifier)
        return send_file(path, as_attachment=True, download_name=name, mimetype='application/zip')

    return app


if __name__ == '__main__':
    from waitress import serve
    host = os.getenv('HOST', '127.0.0.1')
    port = int(os.getenv('PORT', '8093'))
    public_access = os.getenv('ALLOW_PUBLIC_ACCESS', '').lower() in {'1', 'true', 'yes'}
    if host not in ('127.0.0.1', 'localhost', '::1') and not os.getenv('APP_PASSWORD') and not public_access:
        raise SystemExit('Configura APP_PASSWORD o ALLOW_PUBLIC_ACCESS=true para permitir acceso fuera de localhost.')
    print(f'AllToMP3 Web: http://{host}:{port}', flush=True)
    serve(create_app(), host=host, port=port, threads=8)
