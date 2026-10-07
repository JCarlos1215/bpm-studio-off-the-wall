"""Persistent job queue, MP3 conversion, and ID3 metadata."""
import copy
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import threading
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor

import imageio_ffmpeg
import requests
from mutagen.mp3 import MP3
from mutagen.id3 import APIC, ID3, TALB, TCON, TDRC, TIT2, TPE1, TRCK, USLT
from yt_dlp import YoutubeDL

import providers


TERMINAL = {'completed', 'partial', 'failed', 'cancelled'}


class Cancelled(Exception):
    pass


def ffmpeg_path():
    return os.getenv('FFMPEG_PATH') or shutil.which('ffmpeg') or imageio_ffmpeg.get_ffmpeg_exe()


def audio_waveform(path, count=700):
    """Small persisted envelope computed before publishing the completed track."""
    from array import array
    import sys
    import tempfile
    with tempfile.TemporaryFile() as pcm:
        subprocess.run([ffmpeg_path(), '-nostdin', '-hide_banner', '-loglevel', 'error',
                        '-i', str(path), '-vn', '-ac', '1', '-ar', '8000',
                        '-f', 's16le', 'pipe:1'], stdout=pcm, stderr=subprocess.PIPE,
                       timeout=90, check=True)
        length = pcm.tell() // 2
        if not length:
            raise ValueError('El audio no contiene muestras.')
        pcm.seek(0)
        peaks = []
        for index in range(count):
            size = ((index + 1) * length // count - index * length // count) * 2
            samples = array('h')
            samples.frombytes(pcm.read(size))
            if sys.byteorder != 'little':
                samples.byteswap()
            peaks.append(round(max((abs(value) for value in samples), default=0) / 32768, 4))
    return {'peaks': peaks, 'duration': length / 8000}



def safe_name(value):
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', value).strip(' .')[:160] or 'audio'


def tag_file(path, track, cover=None):
    tags = ID3()
    for field, frame in [('title', TIT2), ('artist', TPE1), ('album', TALB), ('genre', TCON), ('year', TDRC), ('track_number', TRCK)]:
        if track.get(field):
            tags.add(frame(encoding=3, text=str(track[field])))
    if track.get('lyrics'):
        tags.add(USLT(encoding=3, lang='und', desc='', text=track['lyrics']))
    if cover:
        data, mime = cover
        tags.add(APIC(encoding=3, mime=mime, type=3, desc='Cover', data=data))
    tags.save(str(path), v2_version=3)


def fetch_cover(url):
    # Do not fetch arbitrary user-provided URLs or follow redirects to unknown hosts.
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or '').lower()
    allowed = ('ytimg.com', 'sndcdn.com', 'dzcdn.net', 'deezer.com', 'scdn.co', 'mzstatic.com')
    if urlparse(url).scheme != 'https' or not any(host == h or host.endswith('.' + h) for h in allowed):
        return None
    with requests.get(url, timeout=15, stream=True, allow_redirects=False) as response:
        response.raise_for_status()
        mime = response.headers.get('Content-Type', '').split(';')[0]
        if mime not in ('image/jpeg', 'image/png'):
            return None
        chunks, size = [], 0
        for chunk in response.iter_content(65536):
            size += len(chunk)
            if size > 5 * 1024 * 1024:
                return None
            chunks.append(chunk)
        return b''.join(chunks), mime


def convert_file(source, target, bitrate, duration=0, progress=None, cancelled=None):
    """No shell, no downloader postprocessor dependency on a system ffprobe."""
    command = [ffmpeg_path(), '-nostdin', '-hide_banner', '-loglevel', 'error',
               '-y', '-i', str(source), '-vn', '-c:a', 'libmp3lame', '-b:a', f'{bitrate}k',
               '-progress', 'pipe:1', str(target)]
    # stderr goes to a file so it cannot deadlock when an input is malformed.
    import tempfile
    with tempfile.TemporaryFile(mode='w+b') as errors:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors, text=True)
        started = time.monotonic()

        def watchdog():
            while process.poll() is None:
                if (cancelled and cancelled()) or time.monotonic() - started > 900:
                    process.terminate()
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    return
                time.sleep(.2)

        watcher = threading.Thread(target=watchdog, daemon=True)
        watcher.start()
        try:
            for line in process.stdout:
                if line.startswith('out_time_us=') and duration and progress:
                    try:
                        progress(min(99, int(line.split('=')[1]) / (duration * 10000)))
                    except ValueError:
                        pass
            code = process.wait()
            if cancelled and cancelled():
                raise Cancelled()
            if code:
                errors.seek(0)
                detail = errors.read(2000).decode('utf-8', errors='replace')
                raise RuntimeError('FFmpeg no pudo convertir el audio: ' + detail)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stdout.close()
            watcher.join(timeout=1)


class JobStore:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = self.root / 'jobs.sqlite3'
        self.jobs = {}
        self.events = {}
        self.executor = ThreadPoolExecutor(max_workers=int(os.getenv('MAX_CONCURRENT_JOBS', '2')))
        with sqlite3.connect(self.db) as conn:
            conn.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
            for identifier, data in conn.execute('SELECT id, data FROM jobs'):
                job = json.loads(data)
                if job['status'] not in TERMINAL:
                    job.update(status='failed', error='El servidor se reinició durante la conversión. Puedes reintentar.')
                    for track in job['tracks']:
                        if track.get('status') not in TERMINAL:
                            track.update(status='failed', error='Conversión interrumpida.')
                self.jobs[identifier] = job
            for job in self.jobs.values():
                conn.execute('INSERT OR REPLACE INTO jobs VALUES (?, ?)', (job['id'], json.dumps(job)))

    def _persist(self, job):
        with sqlite3.connect(self.db) as conn:
            conn.execute('INSERT OR REPLACE INTO jobs VALUES (?, ?)', (job['id'], json.dumps(job)))

    def update(self, identifier, index=None, **fields):
        with self.lock:
            job = self.jobs[identifier]
            (job if index is None else job['tracks'][index]).update(fields)
            job['updated_at'] = time.time()
            self._persist(job)

    def get(self, identifier):
        with self.lock:
            if identifier not in self.jobs:
                raise KeyError(identifier)
            return copy.deepcopy(self.jobs[identifier])

    def list(self):
        with self.lock:
            return copy.deepcopy(sorted(self.jobs.values(), key=lambda j: j['created_at'], reverse=True))

    def create(self, query, options):
        providers.source_type(query)
        with self.lock:
            if sum(j['status'] not in TERMINAL for j in self.jobs.values()) >= 8:
                raise providers.SourceError('La cola está llena. Espera a que termine una conversión.')
            identifier = uuid.uuid4().hex
            job = {'id': identifier, 'query': query, 'title': query, 'status': 'queued',
                   'tracks': [], 'error': '', 'options': options,
                   'created_at': time.time(), 'updated_at': time.time()}
            self.jobs[identifier] = job
            self.events[identifier] = threading.Event()
            self._persist(job)
            self.executor.submit(self._run, identifier)
            return copy.deepcopy(job)

    def cancel(self, identifier):
        with self.lock:
            job = self.get(identifier)
            if job['status'] in TERMINAL:
                return job
            self.events[identifier].set()
            self.update(identifier, status='cancelled', error='Conversión cancelada.')
            return self.get(identifier)

    def delete(self, identifier):
        with self.lock:
            if self.get(identifier)['status'] not in TERMINAL:
                raise providers.SourceError('Cancela la conversión antes de eliminarla.')
            # A cancelled downloader may still be unwinding. Wait before deleting its files.
            if identifier in self.events:
                raise providers.SourceError('La tarea se está deteniendo. Vuelve a intentarlo en unos segundos.')
            del self.jobs[identifier]
            with sqlite3.connect(self.db) as conn:
                conn.execute('DELETE FROM jobs WHERE id = ?', (identifier,))
            shutil.rmtree(self.root / identifier, ignore_errors=True)

    def track_file(self, identifier, index):
        job = self.get(identifier)
        if index < 0 or index >= len(job['tracks']):
            raise KeyError(index)
        track = job['tracks'][index]
        if track['status'] != 'completed':
            raise providers.SourceError('El MP3 todavía no está listo.')
        path = self.root / identifier / track['file']
        if not path.is_file():
            raise KeyError(index)
        return path, safe_name(f"{track['artist']} - {track['title']}") + '.mp3'

    def archive(self, identifier):
        with self.lock:
            job = self.get(identifier)
            if job['status'] not in TERMINAL:
                raise providers.SourceError('Espera a que termine la lista antes de descargar el ZIP.')
            completed = [(i, t) for i, t in enumerate(job['tracks']) if t['status'] == 'completed']
            if not completed:
                raise providers.SourceError('No hay canciones listas para descargar.')
            archive = self.root / identifier / 'playlist.zip'
            with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_STORED) as zip_file:
                for index, track in completed:
                    path, name = self.track_file(identifier, index)
                    zip_file.write(path, f'{index + 1:03d} - {name}')
            return archive, safe_name(job['title']) + '.zip'

    def _run(self, identifier):
        event = self.events[identifier]
        folder = self.root / identifier
        options = self.get(identifier)['options']

        def check():
            if event.is_set():
                raise Cancelled()

        try:
            check()
            self.update(identifier, status='resolving')
            title, tracks = providers.resolve(self.get(identifier)['query'], options['playlist'])
            check()
            folder.mkdir(exist_ok=True)
            for track in tracks:
                track.update(status='queued', progress=0, error='', warnings=[], file='')
            self.update(identifier, title=title, tracks=tracks, status='processing')
            for index, track in enumerate(tracks):
                check()
                try:
                    self._process(identifier, index, track, options, folder, event)
                except Cancelled:
                    raise
                except Exception as error:
                    self.update(identifier, index, status='failed', error=readable_error(error))
            check()
            final = self.get(identifier)['tracks']
            completed = sum(t['status'] == 'completed' for t in final)
            with self.lock:
                check()
                self.update(identifier, status='completed' if completed == len(final) else ('partial' if completed else 'failed'),
                            error='' if completed else 'No se pudo convertir ninguna canción. Consulta el detalle de cada pista.')
        except Cancelled:
            self.update(identifier, status='cancelled', error='Conversión cancelada.')
            for index, track in enumerate(self.get(identifier)['tracks']):
                if track['status'] not in TERMINAL:
                    self.update(identifier, index, status='cancelled')
        except Exception as error:
            self.update(identifier, status='failed', error=readable_error(error))
        finally:
            for path in folder.glob('source-*'):
                path.unlink(missing_ok=True)
            with self.lock:
                self.events.pop(identifier, None)

    def _process(self, identifier, index, track, options, folder, event):
        def check():
            if event.is_set():
                raise Cancelled()

        self.update(identifier, index, status='searching')
        equivalent = track['source'] in ('spotify', 'deezer')
        attempts = []
        source_attempts = []

        def record_attempt(provider, error):
            message = readable_error(error)
            attempts.append(message)
            source_attempts.append({'provider': provider, 'error': message})
            self.update(identifier, index, source_attempts=list(source_attempts))

        def candidate_urls():
            if not equivalent:
                yield track['source_url']
                return
            try:
                _, matches = providers.extract_online(f"{track['artist']} {track['title']} audio")
                if matches:
                    yield matches[0]['source_url']
            except providers.SourceError as error:
                record_attempt('youtube', error)
            check()
            self.update(identifier, index, status='searching')
            try:
                matches = providers.soundcloud_equivalents(track)
                if not matches:
                    record_attempt('soundcloud', providers.SourceError('No se encontró una coincidencia fiable de título, artista y duración en SoundCloud.'))
                for candidate in matches:
                    yield candidate['source_url']
            except providers.SourceError as error:
                record_attempt('soundcloud', error)

        last_update = [0]

        def progress(data):
            check()
            now = time.monotonic()
            if now - last_update[0] > .4:
                last_update[0] = now
                total = data.get('total_bytes') or data.get('total_bytes_estimate') or 0
                pct = min(69, data.get('downloaded_bytes', 0) / total * 70) if total else 0
                self.update(identifier, index, progress=round(pct, 1))

        def download_audio(url):
            providers.source_type(url)
            providers.check_youtube_cooldown(url)
            self.update(identifier, index, status='downloading', progress=0)
            with providers.open_downloader(providers.ydl_options(
                format='bestaudio[format_id!*=preview]/best[format_id!*=preview]', noplaylist=True,
                outtmpl=str(folder / f'source-{index}.%(ext)s'),
                progress_hooks=[progress],
                max_filesize=200 * 1024 * 1024,
                match_filter=lambda info, *, incomplete: 'El audio supera el límite de 30 minutos.' if (info.get('duration') or 0) > 1800 else None,
            ), factory=YoutubeDL) as ydl:
                info = ydl.extract_info(url, download=True)
                check()
                if not info:
                    raise providers.SourceError('Este audio no está disponible o supera el límite de 30 minutos.')
                source = Path(ydl.prepare_filename(info))
            if not source.is_file():
                raise RuntimeError('No se encontró el archivo de audio descargado.')
            return info, source

        for url in candidate_urls():
            check()
            try:
                info, source = download_audio(url)
                if equivalent:
                    track['audio_source_url'] = url
                    track['audio_source_provider'] = providers.source_type(url)
                break
            except providers.SourceError as error:
                check()
                if not equivalent:
                    raise
                record_attempt(providers.source_type(url), error)
                for temporary in folder.glob(f'source-{index}.*'):
                    temporary.unlink(missing_ok=True)
        else:
            raise providers.SourceError('No se encontró una fuente completa y accesible que coincida con esta canción. ' + ' '.join(dict.fromkeys(attempts)))
        full = providers.video_track(info, providers.source_type(url))
        for field in ('title', 'artist', 'duration', 'cover'):
            if not track.get(field):
                track[field] = full.get(field, '')
        # Flat playlist titles may omit the artist. Full extraction has better metadata.
        if track['source'] in ('youtube', 'soundcloud'):
            track.update(title=full['title'], artist=full['artist'], duration=full['duration'], cover=full['cover'])
        track.update(status='converting', progress=70)
        self.update(identifier, index, **track)
        target = folder / f'{index:04d}.mp3'
        convert_file(source, target, options['bitrate'], track.get('duration', 0),
                     progress=lambda p: self.update(identifier, index, progress=round(70 + p * .25, 1)),
                     cancelled=event.is_set)
        check()
        if equivalent:
            actual_duration = MP3(target).info.length
            expected_duration = track.get('duration') or 0
            if expected_duration and abs(actual_duration - expected_duration) > max(5, expected_duration * .08):
                target.unlink(missing_ok=True)
                raise providers.SourceError('El audio disponible no coincide con la duración de Spotify. No se entrega una muestra ni una versión de otra duración.')
            track['duration'] = actual_duration
        self.update(identifier, index, status='tagging', progress=95)
        warnings = providers.enrich(track, options['lyrics']) if options['tags'] else []
        if equivalent and track.get('audio_source_provider') == 'soundcloud':
            warnings.append('Audio equivalente encontrado en SoundCloud. Revisa la fuente; puede ser otra versión.')
        check()
        cover = None
        if options['tags'] and track.get('cover'):
            try:
                cover = fetch_cover(track['cover'])
                if not cover:
                    warnings.append('La portada no pudo incrustarse en el MP3.')
            except requests.RequestException:
                warnings.append('La portada no pudo descargarse.')
        check()
        if options['tags']:
            tag_file(target, track, cover)
        try:
            track['waveform'] = audio_waveform(target)
        except (subprocess.SubprocessError, ValueError, OSError):
            warnings.append('La onda se calculará al abrir la vista previa.')
        check()
        track.update(status='completed', progress=100, file=target.name, warnings=warnings)
        self.update(identifier, index, **track)
        source.unlink(missing_ok=True)


def readable_error(error):
    message = re.sub(r'\x1b\[[0-9;]*m', '', str(error)).strip()
    lower = message.lower()
    if message.startswith('No se encontró una fuente completa y accesible'):
        return message[:1200]
    if '429' in lower or 'too many requests' in lower:
        return 'YouTube limita las solicitudes del servidor (HTTP 429). Espera antes de reintentar.'
    if 'certificate verify failed' in lower:
        return 'El servidor no pudo verificar el certificado de la fuente de audio. Revisa los certificados del despliegue.'
    if '403' in lower or 'forbidden' in lower:
        return 'La fuente de audio rechazó el acceso del servidor (HTTP 403). No se pudo descargar este archivo.'
    if 'sign in' in lower or 'not a bot' in lower or 'confirm you’re not' in lower:
        if 'youtube' not in lower:
            return 'La plataforma requiere verificación o inicio de sesión para acceder a este audio.'
        if os.getenv('YTDLP_COOKIES_FILE', '').strip():
            return 'YouTube rechazó la sesión del servidor. Puede haber caducado o la conexión del servidor puede estar bloqueada. Consulta la configuración de YouTube del servidor.'
        return 'YouTube solicita verificación al servidor que descarga el audio. Configura una sesión de YouTube en el servidor o usa un enlace de SoundCloud disponible.'
    if 'Failed to extract any player response' in message:
        return ('YouTube no devolvió una respuesta válida al servidor. Revisa la versión de '
                'yt-dlp, sus componentes EJS y Node.js 22 o posterior en /api/status; '
                'si están actualizados, comprueba la disponibilidad del video y la conexión del servidor.')
    return message[:1200] or 'No se pudo completar esta operación.'
