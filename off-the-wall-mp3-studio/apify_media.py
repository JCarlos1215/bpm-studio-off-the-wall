"""Server-only adapter for the selected Apify actor. No yt-dlp fallback."""
import os
import re
import time
from urllib.parse import urlparse
import requests

ACTOR_ID = 'khD9YVX2qDu2v4585'
API = 'https://api.apify.com/v2'


def configuration():
    task = os.getenv('APIFY_TASK_ID', '').strip()
    hosts = [h.strip().lower() for h in os.getenv('APIFY_DOWNLOAD_HOSTS', '').split(',') if h.strip()]
    ready = bool(os.getenv('APIFY_TOKEN', '').strip() and re.fullmatch(r'[A-Za-z0-9_-]+', task) and hosts)
    return {'provider': 'apify', 'configured': ready, 'actor': 'business_development/youtube-4k-long-video-downloader',
            'message': 'Apify listo. Cada ejecución puede generar cargos.' if ready else
            'Apify pendiente de configurar en el servidor. Las descargas de YouTube aún no están activadas.'}


def api(method, path, **kwargs):
    # Authentication never appears in query strings, saved jobs, or client responses.
    try:
        response = requests.request(method, API + path,
            headers={'Authorization': 'Bearer ' + os.environ['APIFY_TOKEN']}, timeout=30, **kwargs)
        if not response.ok:
            raise ValueError(f'Apify rechazó la solicitud (HTTP {response.status_code}). Revisa el acceso y el saldo de la cuenta.')
        body = response.json()
        return body['data'] if isinstance(body, dict) else body
    except (requests.RequestException, KeyError) as exc:
        raise ValueError('No se pudo obtener una respuesta válida de Apify.') from None


def download(url, path, check):
    allowed = {h.strip().lower() for h in os.environ['APIFY_DOWNLOAD_HOSTS'].split(',')}
    parsed = urlparse(url)
    # Only exact, administrator-configured storage hosts. Never fetch arbitrary actor URLs.
    if parsed.scheme != 'https' or parsed.hostname not in allowed or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('La salida de Apify no pertenece al almacenamiento autorizado.')
    try:
        with requests.get(url, stream=True, timeout=(15, 45), allow_redirects=False) as response:
            if response.status_code != 200:
                raise ValueError('El almacenamiento no entregó el audio. Revisa el enlace de salida de la tarea.')
            if not any(t in response.headers.get('Content-Type', '').lower() for t in ('audio/', 'application/octet-stream')):
                raise ValueError('El almacenamiento no devolvió un archivo de audio.')
            size = 0
            with path.open('wb') as output:
                for chunk in response.iter_content(65536):
                    check()
                    size += len(chunk)
                    if size > 64 * 1024 * 1024:
                        raise ValueError('El audio supera el límite de 64 MB.')
                    output.write(chunk)
            if not size:
                raise ValueError('Apify entregó un archivo vacío.')
    except requests.RequestException:
        raise ValueError('No se pudo recibir el archivo de Apify.') from None


def run(store, identifier, folder, event, check):
    from engine import convert_file, MP3
    if not configuration()['configured']:
        raise ValueError(configuration()['message'])
    task = os.environ['APIFY_TASK_ID'].strip()
    # Validate the task before incurring a charge; reject other actors.
    if api('GET', '/actor-tasks/' + task).get('actId') != ACTOR_ID:
        raise ValueError('La tarea configurada no pertenece al actor de Apify seleccionado.')
    check()
    job = store.get(identifier)
    track = {'title': 'Audio de YouTube', 'artist': 'YouTube', 'source': 'youtube',
             'source_url': job['query'], 'status': 'processing', 'progress': 5,
             'error': '', 'file': '', 'warnings': []}
    store.update(identifier, status='processing', tracks=[track])
    remote_id = None
    try:
        # One public video per run. Do not enable proxy/cookie workarounds by default.
        remote = api('POST', '/actor-tasks/' + task + '/runs',
                     params={'maxTotalChargeUsd': '0.50', 'timeout': '600', 'memory': '4096'},
                     json={'startUrls': [{'url': job['query']}], 'quality': 'audio-only',
                           'format': 'mp3', 'filename': 'title', 'downloadAudioOnly': True,
                           'downloadBoth': False, 'proxyConfiguration': {'useApifyProxy': False}, 'cookieFile': ''})
        remote_id = remote['id']
        store.update(identifier, apify_run_id=remote_id)
        deadline = time.monotonic() + 660
        while remote.get('status') not in {'SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'}:
            check()
            if time.monotonic() >= deadline:
                raise ValueError('Apify superó el tiempo de espera. La ejecución se cancelará.')
            event.wait(2)
            check()
            remote = api('GET', '/actor-runs/' + remote_id)
        if remote['status'] != 'SUCCEEDED':
            raise ValueError('Apify no completó la descarga (' + remote['status'] + '). Revisa la ejecución en Apify.')
        dataset = remote.get('defaultDatasetId')
        if not dataset:
            raise ValueError('La tarea terminó sin un conjunto de resultados descargables.')
        items = api('GET', '/datasets/' + dataset + '/items', params={'limit': 2})
        if not isinstance(items, list) or len(items) != 1:
            raise ValueError('Se esperaba exactamente un archivo de audio en la salida de Apify.')
        value = items[0]
        for part in os.getenv('APIFY_OUTPUT_URL_FIELD', 'downloadUrl').split('.'):
            value = value.get(part) if isinstance(value, dict) else None
        if not isinstance(value, str):
            raise ValueError('La salida del actor no incluye el enlace de audio configurado. Revisa APIFY_OUTPUT_URL_FIELD.')
        check()
        folder.mkdir(exist_ok=True)
        source = folder / 'source-apify.mp3'
        store.update(identifier, 0, status='downloading', progress=45)
        download(value, source, check)
        duration = MP3(source).info.length
        if duration <= 0 or duration > 1800:
            raise ValueError('El audio está vacío o supera los 30 minutos.')
        target = folder / '0000.mp3'
        store.update(identifier, 0, status='converting', progress=70)
        convert_file(source, target, job['options']['bitrate'], duration,
                     progress=lambda p: store.update(identifier, 0, progress=70 + p * .25), cancelled=event.is_set)
        check()
        title = str(items[0].get('title') or 'Audio de YouTube')[:200]
        store.update(identifier, 0, title=title, duration=duration, file=target.name, status='completed', progress=100)
        store.update(identifier, title=title, status='completed', error='')
    finally:
        if remote_id and (event.is_set() or store.get(identifier)['status'] != 'completed'):
            try:
                api('POST', '/actor-runs/' + remote_id + '/abort')
            except ValueError:
                pass
