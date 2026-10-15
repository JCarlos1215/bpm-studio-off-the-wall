import hmac
import os
import re
from pathlib import Path
from urllib.parse import urlparse, parse_qs

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
    media_origins = {'https://jcarlos1215.github.io', 'http://127.0.0.1:8080', 'http://localhost:8080'}

    @app.before_request
    def protect():
        password = os.getenv('APP_PASSWORD', '')
        if password and not public_access and request.path.startswith('/api/') and request.path != '/api/status':
            auth = request.authorization
            if not auth or not hmac.compare_digest(auth.password or '', password):
                return Response('Acceso protegido. Usa cualquier nombre de usuario y la contraseña del servidor.', 401,
                                {'WWW-Authenticate': 'Basic realm="Download Manager", charset="UTF-8"'})
        if request.method in ('POST', 'PATCH', 'DELETE'):
            origin = request.headers.get('Origin')
            media_request = request.path.startswith('/api/media/') and origin in media_origins
            if origin and urlparse(origin).netloc != request.host and not media_request:
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
        response.headers['Content-Security-Policy'] = f"default-src 'self'; img-src 'self' https: data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-src https://www.youtube.com https://w.soundcloud.com; frame-ancestors {frame_ancestors}; base-uri 'self'; form-action 'self'"
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        if request.path == '/api/spotify/playlist':
            origin = request.headers.get('Origin', '')
            if origin in {'https://jcarlos1215.github.io', 'http://127.0.0.1:8080', 'http://localhost:8080'}:
                response.headers['Access-Control-Allow-Origin'] = origin
                response.headers.add('Vary', 'Origin')
        if request.path.startswith('/api/media/') and request.headers.get('Origin') in media_origins:
            response.headers['Access-Control-Allow-Origin'] = request.headers['Origin']
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Requested-With'
            response.headers.add('Vary', 'Origin')
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
                       playlist_limit=providers.MAX_ITEMS,
                       downloader=providers.downloader_status())

    @app.post('/api/search')
    def search():
        payload = request.get_json()
        if not isinstance(payload, dict) or not isinstance(payload.get('query'), str):
            raise ValueError('Introduce una búsqueda válida.')
        try:
            tracks = providers.search(payload['query'], source=payload.get('source', 'auto'))
            cached = {}
            for job in store.list():
                for index, item in enumerate(job['tracks']):
                    if item.get('status') == 'completed' and item.get('waveform'):
                        for url in (item.get('source_url'), item.get('audio_source_url')):
                            if url and url not in cached:
                                cached[url] = {'waveform': item['waveform'], 'preview_job': job['id'], 'preview_index': index}
            return jsonify(tracks=[{**track, 'preview_url': providers.preview_url(track),
                                    **cached.get(track.get('source_url'), {})} for track in tracks])
        except providers.SourceError:
            raise
        except Exception as exc:
            return jsonify(error=readable_error(exc)), 502

    @app.get('/api/jobs')
    def jobs():
        return jsonify(jobs=store.list())

    @app.get('/api/media/config')
    def media_config():
        if os.getenv('BPM_MEDIA_ENGINE', 'native') == 'apify':
            import apify_media
            return jsonify(apify_media.configuration())
        return jsonify(provider='native', configured=True,
                       concurrency=int(os.getenv('MAX_CONCURRENT_JOBS', '2')),
                       queue_limit=int(os.getenv('MAX_QUEUED_JOBS', '100')),
                       message='API propia de BPM disponible. YouTube y SoundCloud; la disponibilidad depende de la fuente.')

    @app.post('/api/media/jobs')
    def media_create():
        payload = request.get_json()
        if not isinstance(payload, dict) or not isinstance(payload.get('url'), str):
            raise ValueError('Pega un enlace de YouTube o SoundCloud.')
        query = payload['url'].strip()
        provider = providers.source_type(query)
        if provider not in {'youtube', 'soundcloud'}:
            raise ValueError('Este formulario admite únicamente enlaces de YouTube y SoundCloud.')
        parsed = urlparse(query)
        values = parse_qs(parsed.query)
        if provider == 'youtube':
            video = (values.get('v') or [''])[0] if parsed.path.rstrip('/') == '/watch' else parsed.path.rstrip('/').split('/')[-1]
            video_path = parsed.hostname == 'youtu.be' or parsed.path.rstrip('/') == '/watch' or bool(re.fullmatch(r'/(shorts|embed|live)/[A-Za-z0-9_-]{11}/?', parsed.path))
            list_path = parsed.path.rstrip('/') == '/playlist' and bool(re.fullmatch(r'[A-Za-z0-9_-]{10,120}', (values.get('list') or [''])[0]))
            if not (video_path and re.fullmatch(r'[A-Za-z0-9_-]{11}', video) or list_path):
                raise ValueError('Usa el enlace de un video o una playlist de YouTube.')
        elif not re.fullmatch(r'/[A-Za-z0-9_-]+/(?:sets/)?[A-Za-z0-9_-]+/?', parsed.path) or values.get('secret_token'):
            raise ValueError('Usa el enlace público de una canción o un set de SoundCloud.')
        bitrate = payload.get('bitrate', 192)
        playlist = payload.get('playlist', False)
        if type(bitrate) is not int or bitrate not in (128, 192, 256, 320) or type(playlist) is not bool:
            raise ValueError('Opciones de descarga no válidas.')
        if os.getenv('BPM_MEDIA_ENGINE', 'native') != 'apify':
            if provider == 'youtube' and not playlist:
                if list_path:
                    raise ValueError('Activa la opción de playlist para descargar una lista de YouTube.')
                query = 'https://www.youtube.com/watch?v=' + video
            return jsonify(job=store.create(query, {'bitrate': bitrate, 'playlist': playlist, 'tags': True, 'lyrics': False})), 202
        import apify_media
        if provider != 'youtube' or list_path:
            raise ValueError('Apify admite aquí enlaces de videos individuales de YouTube. Las playlists de Spotify conservan su descarga ZIP.')
        query = 'https://www.youtube.com/watch?v=' + video
        if not apify_media.configuration()['configured']:
            return jsonify(error=apify_media.configuration()['message']), 503
        # Serialize admission so the daily paid-run cap cannot race across requests.
        with store.lock:
            import time
            today = int(time.time() // 86400)
            paid = sum(j.get('options', {}).get('engine') == 'apify' and int(j['created_at'] // 86400) == today for j in store.list())
            if paid >= 5:
                return jsonify(error='Se alcanzó el límite de 5 solicitudes de Apify por día (UTC).'), 429
            return jsonify(job=store.create(query, {'bitrate': bitrate, 'playlist': playlist, 'tags': True, 'lyrics': False, 'engine': 'apify'})), 202

    @app.get('/api/media/jobs/<identifier>')
    def media_job(identifier):
        return jsonify(job=store.get(identifier))

    @app.post('/api/media/jobs/<identifier>/cancel')
    def media_cancel(identifier):
        return jsonify(job=store.cancel(identifier))

    @app.get('/api/media/jobs/<identifier>/tracks/<int:index>/download')
    def media_download(identifier, index):
        path, name = store.track_file(identifier, index)
        return send_file(path, as_attachment=True, download_name=name, mimetype='audio/mpeg')

    @app.get('/api/media/jobs/<identifier>/archive')
    def media_archive(identifier):
        path, name = store.archive(identifier)
        return send_file(path, as_attachment=True, download_name=name, mimetype='application/zip')

    @app.get('/api/spotify/playlist')
    def spotify_playlist():
        from spotify_playlist import resolve_playlist
        return jsonify(resolve_playlist(request.args.get('url', '')))

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
    print(f'Download Manager: http://{host}:{port}', flush=True)
    serve(create_app(), host=host, port=port, threads=8)
