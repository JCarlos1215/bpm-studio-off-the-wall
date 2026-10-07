"""Equivalent source resolution to AllToMP3 using maintained extractors."""
from contextlib import contextmanager
import json
import logging
import unicodedata
from difflib import SequenceMatcher
from collections import deque
import os
from html.parser import HTMLParser
import re
import shutil
import subprocess
from importlib.metadata import version, PackageNotFoundError

import tempfile
import time
from urllib.parse import urlparse, urljoin

import requests
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError


class SourceError(ValueError):
    pass


MAX_ITEMS = int(os.getenv('MAX_PLAYLIST_ITEMS', '100'))
HTTP_TIMEOUT = 20
_youtube_retry_at = 0.0


def youtube_cooldown_remaining():
    return max(0, int(_youtube_retry_at - time.monotonic()))


def check_youtube_cooldown(url):
    if source_type(url) in ('youtube', 'search') and youtube_cooldown_remaining():
        raise SourceError(f'YouTube limita las solicitudes (HTTP 429). Pausa activa: {youtube_cooldown_remaining()} segundos.')


def record_youtube_limit(detail):
    global _youtube_retry_at
    if 'youtube' in detail.lower() and ('429' in detail or 'too many requests' in detail.lower()):
        _youtube_retry_at = time.monotonic() + 900
HEADERS = {'User-Agent': 'AllToMP3-Web/1.0 (https://github.com/AllToMP3)'}


def source_type(query):
    query = query.strip()
    if not query:
        raise SourceError('Introduce un enlace o el nombre de una canción.')
    if len(query) > 1000:
        raise SourceError('La búsqueda es demasiado larga.')
    if not re.match(r'^https?://', query, re.I):
        if '://' in query or query.startswith(('//', 'file:', 'spotify:')):
            raise SourceError('Usa un enlace HTTPS completo o una búsqueda por nombre.')
        return 'search'
    parsed = urlparse(query)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise SourceError('Usa un enlace HTTPS sin credenciales ni puertos especiales.')
    host = (parsed.hostname or '').lower()
    hosts = {
        'youtube': {'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'},
        'soundcloud': {'soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'},
        'spotify': {'open.spotify.com'},
        'deezer': {'deezer.com', 'www.deezer.com', 'link.deezer.com', 'deezer.page.link'},
    }
    for provider, allowed in hosts.items():
        if host in allowed:
            return provider
    raise SourceError('Enlace no compatible. Usa YouTube, SoundCloud, Spotify o Deezer.')


def ydl_options(**extra):
    return {
        'quiet': True, 'no_warnings': False, 'socket_timeout': 20,
        'retries': 2, 'extractor_retries': 2, 'cachedir': False,
        'js_runtimes': {'node': {}}, **extra,
    }


def downloader_status():
    """Expose runtime versions without credentials or filesystem paths."""
    packages = {}
    for name in ('yt-dlp', 'yt-dlp-ejs'):
        try:
            packages[name] = version(name)
        except PackageNotFoundError:
            packages[name] = None
    node_version = None
    if shutil.which('node'):
        try:
            node_version = subprocess.check_output(
                ['node', '--version'], text=True, timeout=5).strip()
        except (OSError, subprocess.SubprocessError):
            pass
    major = int(node_version.lstrip('v').split('.')[0]) if node_version else 0
    return {**packages, 'node': node_version,
            'javascript_ready': major >= 22 and bool(packages['yt-dlp-ejs']),
            'youtube_cooldown_seconds': youtube_cooldown_remaining()}


class ExtractionLogger:
    """Retain the transport failure hidden by yt-dlp's final player error."""
    def __init__(self):
        self.warnings = deque(maxlen=6)

    @staticmethod
    def safe_detail(message):
        text = re.sub(r'https?://[^\s]+', '[url]', str(message))
        text = re.sub(r'\x1b\[[0-9;]*m', '', text)
        return text.replace('\n', ' ')[:800]

    def debug(self, message):
        pass

    def warning(self, message):
        detail = self.safe_detail(message)
        self.warnings.append(detail)
        logging.getLogger(__name__).warning('yt-dlp: %s', detail)

    def error(self, message):
        logging.getLogger(__name__).error('yt-dlp: %s', self.safe_detail(message))


@contextmanager
def open_downloader(options, factory=None):
    """Use an optional server session; keep mounted secrets read-only."""
    logger = ExtractionLogger()
    options = {**options, 'logger': logger}
    cookie_file = os.getenv('YTDLP_COOKIES_FILE', '').strip()
    factory = factory or YoutubeDL
    if not cookie_file:
        with factory(options) as downloader:
            try:
                yield downloader
            except DownloadError as exc:
                detail = ' | '.join([logger.safe_detail(exc), *logger.warnings])
                record_youtube_limit(detail)
                raise SourceError(detail) from exc
        return
    with tempfile.TemporaryDirectory(prefix='mp3-session-') as directory:
        cookie_copy = os.path.join(directory, 'cookies.txt')
        try:
            shutil.copyfile(cookie_file, cookie_copy)
            os.chmod(cookie_copy, 0o600)
        except OSError as exc:
            raise SourceError('No se pudo leer la sesión configurada en YTDLP_COOKIES_FILE del servidor.') from exc
        with factory({**options, 'cookiefile': cookie_copy}) as downloader:
            try:
                yield downloader
            except DownloadError as exc:
                detail = ' | '.join([logger.safe_detail(exc), *logger.warnings])
                record_youtube_limit(detail)
                raise SourceError(detail) from exc


def clean_title(title):
    return re.sub(r'\s*[\[(](?:official.*?|lyrics.*?|audio.*?|video.*?)[\])]\s*', '', title or '', flags=re.I).strip()


def video_track(info, provider='youtube'):
    artist = info.get('artist') or info.get('creator') or info.get('uploader') or ''
    title = info.get('track') or clean_title(info.get('title', 'Sin título'))
    if not info.get('track') and ' - ' in title:
        artist, title = title.split(' - ', 1)
    url = info.get('webpage_url') or info.get('url', '')
    if provider == 'youtube' and not url.startswith('https://'):
        url = 'https://www.youtube.com/watch?v=' + info['id']
    if url:
        source_type(url)
    return {
        'title': title, 'artist': artist, 'album': info.get('album') or '',
        'genre': info.get('genre') or '', 'duration': info.get('duration') or 0,
        'cover': info.get('thumbnail') or '', 'source_url': url,
        'source': provider, 'year': '', 'track_number': info.get('track_number') or '',
    }


def extract_online(query, search_limit=1, playlist=False):
    check_youtube_cooldown(query)
    provider = source_type(query)
    if provider == 'search':
        query = f'ytsearch{search_limit}:{query}'
        provider = 'youtube'
    with open_downloader(ydl_options(
        extract_flat=True if query.startswith('ytsearch') else 'in_playlist', skip_download=True,
        noplaylist=not playlist, playlistend=MAX_ITEMS,
    )) as ydl:
        info = ydl.extract_info(query, download=False)
    if not info:
        raise SourceError('No se encontró audio disponible para esta búsqueda.')
    entries = info.get('entries')
    raw = list(entries)[:MAX_ITEMS] if entries is not None else [info]
    tracks = [video_track(item, provider) for item in raw if item]
    if not tracks:
        raise SourceError('La lista está vacía o sus canciones no están disponibles.')
    return info.get('title') or tracks[0]['title'], tracks


def normalize_match(value):
    value = unicodedata.normalize('NFKD', value or '')
    value = ''.join(c for c in value if not unicodedata.combining(c)).lower()
    return re.sub(r'[\W_]+', ' ', value).strip()


def equivalent_score(track, candidate):
    """Reject other artists, versions and substantially different durations."""
    title = normalize_match(track.get('title'))
    artist = normalize_match(track.get('artist'))
    candidate_title = normalize_match(clean_title(candidate.get('title')))
    candidate_artist = normalize_match(candidate.get('artist'))
    if not title or not artist:
        return 0
    variants = ('remix', 'cover', 'live', 'karaoke', 'instrumental', 'slowed', 'nightcore', 'bootleg', 'sped')
    if any(word in candidate_title.split() and word not in title.split() for word in variants):
        return 0
    artist_score = SequenceMatcher(None, artist, candidate_artist).ratio()
    if artist in candidate_title:
        candidate_title = candidate_title.replace(artist, '').strip()
        artist_score = 1
    # Remix uploads often credit collaborators in parentheses and a different order.
    collaborators = [normalize_match(part) for part in track.get('artist', '').split(',') if part.strip()]
    original_title = normalize_match(clean_title(candidate.get('title')))
    credited_remix = ('remix' in title.split() and 'remix' in original_title.split()
                      and all(re.search(r'(?<!\w)' + re.escape(part) + r'(?!\w)', original_title)
                              for part in collaborators))
    if credited_remix:
        candidate_title = original_title
        for part in collaborators:
            candidate_title = re.sub(r'(?<!\w)' + re.escape(part) + r'(?!\w)', ' ', candidate_title)
        artist_score = 1
    title_score = SequenceMatcher(None, title, candidate_title).ratio()
    if credited_remix and set(title.split()) <= set(candidate_title.split()):
        title_score = 1
    if title_score < .85 or artist_score < .8:
        return 0
    expected, actual = track.get('duration') or 0, candidate.get('duration') or 0
    if expected and (not actual or abs(expected - actual) > max(5, expected * .08)):
        return 0
    return title_score + artist_score


def soundcloud_equivalents(track):
    query = f"scsearch25:{track['artist']} {track['title']}"
    with open_downloader(ydl_options(extract_flat=True, skip_download=True)) as ydl:
        info = ydl.extract_info(query, download=False)
    candidates = [video_track(item, 'soundcloud') for item in (info or {}).get('entries', []) if item]
    matches = [(equivalent_score(track, candidate), candidate) for candidate in candidates]
    selected = [candidate for score, candidate in sorted(matches, key=lambda row: row[0], reverse=True) if score > 0][:5]
    logging.getLogger(__name__).warning('SoundCloud equivalents: %s candidates, %s matches', len(candidates), len(selected))
    return selected


def get_json(url, **kwargs):
    response = requests.get(url, timeout=HTTP_TIMEOUT, headers=HEADERS, **kwargs)
    response.raise_for_status()
    return response.json()


def deezer_track(item, album=None):
    album = album or item.get('album') or {}
    return {
        'title': item.get('title', ''), 'artist': ', '.join(dict.fromkeys(a.get('name') for a in item.get('contributors', []) if a.get('name'))) or (item.get('artist') or {}).get('name', ''),
        'album': album.get('title', ''), 'genre': ((album.get('genres') or {}).get('data') or [{}])[0].get('name', ''),
        'duration': item.get('duration') or 0, 'cover': album.get('cover_xl') or album.get('cover_big') or '',
        'source_url': item.get('link') or f"https://www.deezer.com/track/{item['id']}",
        'source': 'deezer', 'year': (item.get('release_date') or album.get('release_date') or '')[:4],
        'track_number': item.get('track_position') or '',
    }


def deezer_resolve(url):
    source_type(url)
    # Follow sharing redirects only within explicitly supported Deezer hosts.
    for _ in range(5):
        if urlparse(url).hostname in ('deezer.com', 'www.deezer.com'):
            break
        response = requests.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT, allow_redirects=False)
        if response.status_code not in (301, 302, 303, 307, 308) or not response.headers.get('Location'):
            raise SourceError('No se pudo abrir el enlace compartido de Deezer. Copia el enlace completo de la canción, álbum o playlist.')
        url = urljoin(url, response.headers['Location'])
        if source_type(url) != 'deezer':
            raise SourceError('El enlace compartido no dirige a Deezer.')
    match = re.fullmatch(r'/(?:[a-z]{2}/)?(track|album|playlist)/(\d+)/?', urlparse(url).path)
    if not match:
        raise SourceError('Usa el enlace completo de una canción, álbum o lista de Deezer.')
    kind, identifier = match.groups()
    info = get_json(f'https://api.deezer.com/{kind}/{identifier}')
    if info.get('error'):
        raise SourceError('Deezer no pudo acceder a este enlace.')
    if kind == 'track':
        return info['title'], [deezer_track(info)]
    page = info.get('tracks', {})
    items = page.get('data', [])
    while page.get('next') and len(items) < MAX_ITEMS:
        next_url = page['next']
        parsed = urlparse(next_url)
        if parsed.scheme != 'https' or parsed.hostname != 'api.deezer.com' or parsed.username or parsed.password or parsed.port not in (None, 443):
            raise SourceError('Deezer devolvió una página de canciones no válida.')
        page = get_json(next_url.replace('http://', 'https://', 1))
        items.extend(page.get('data', []))
    tracks = [deezer_track(item, info if kind == 'album' else None) for item in items[:MAX_ITEMS]]
    if not tracks:
        raise SourceError('La lista de Deezer está vacía o no es pública.')
    return info.get('title', 'Deezer'), tracks


def spotify_token():
    client = os.getenv('SPOTIFY_CLIENT_ID')
    secret = os.getenv('SPOTIFY_CLIENT_SECRET')
    if not client or not secret:
        raise SourceError('Spotify requiere SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en el archivo .env del servidor.')
    response = requests.post(
        'https://accounts.spotify.com/api/token', auth=(client, secret),
        data={'grant_type': 'client_credentials'}, timeout=HTTP_TIMEOUT,
    )
    if response.status_code != 200:
        raise SourceError('Spotify rechazó las credenciales configuradas en el servidor.')
    return response.json()['access_token']


def spotify_track(item, album=None):
    album = album or item.get('album') or {}
    images = album.get('images') or []
    return {
        'title': item.get('name', ''), 'artist': ', '.join(a['name'] for a in item.get('artists', [])),
        'album': album.get('name', ''), 'genre': '', 'duration': (item.get('duration_ms') or 0) / 1000,
        'cover': images[0]['url'] if images else '', 'source': 'spotify',
        'source_url': (item.get('external_urls') or {}).get('spotify', ''),
        'year': album.get('release_date', '')[:4], 'track_number': item.get('track_number', ''),
    }



class _SpotifyEmbedData(HTMLParser):
    """Read Spotify's public metadata without executing page scripts."""
    def __init__(self):
        super().__init__()
        self.reading = False
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == 'script' and dict(attrs).get('id') == '__NEXT_DATA__':
            self.reading = True

    def handle_data(self, data):
        if self.reading:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == 'script':
            self.reading = False


def spotify_public_resolve(kind, identifier):
    """Resolve only the tracks Spotify exposes in its public embed."""
    unavailable = ('Spotify no publica canciones accesibles para este enlace. '
                   'Comprueba que la lista sea pública; las listas privadas o personalizadas '
                   'pueden requerir acceso de usuario. Prueba una lista pública o un enlace de YouTube.')
    try:
        response = requests.get(
            f'https://open.spotify.com/embed/{kind}/{identifier}',
            headers=HEADERS, timeout=HTTP_TIMEOUT,
        )
        response.raise_for_status()
        parser = _SpotifyEmbedData()
        parser.feed(response.text)
        data = json.loads(''.join(parser.parts))
        entity = data['props']['pageProps']['state']['data']['entity']
    except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
        raise SourceError(unavailable) from exc
    if not isinstance(entity, dict) or entity.get('id') != identifier or entity.get('type') != kind:
        raise SourceError(unavailable)

    rows = [entity] if kind == 'track' else entity.get('trackList') or []
    tracks = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        uri = row.get('uri') or ''
        match = re.fullmatch(r'spotify:track:([A-Za-z0-9]+)', uri)
        title = row.get('title') or row.get('name')
        artist = ', '.join(a.get('name', '') for a in row.get('artists', []) if isinstance(a, dict)) or row.get('subtitle') or ''
        if not match or not title or not artist:
            continue
        images = (row.get('visualIdentity') or {}).get('image') or []
        release = (row.get('releaseDate') or {}).get('isoString') or ''
        tracks.append({
            'title': title, 'artist': artist, 'album': entity.get('name', '') if kind == 'album' else '',
            'genre': '', 'duration': (row.get('duration') or 0) / 1000,
            'cover': images[0].get('url', '') if images else '',
            'source_url': 'https://open.spotify.com/track/' + match[1],
            'source': 'spotify', 'year': release[:4], 'track_number': '',
        })
        if len(tracks) >= MAX_ITEMS:
            break
    if not tracks:
        raise SourceError(unavailable)
    return entity.get('name') or entity.get('title') or 'Spotify', tracks


def spotify_resolve(url):
    match = re.search(r'/(track|album|playlist)/([A-Za-z0-9]+)', urlparse(url).path)
    if not match:
        raise SourceError('Usa el enlace completo de una canción, álbum o lista de Spotify.')
    kind, identifier = match.groups()
    if not (os.getenv('SPOTIFY_CLIENT_ID', '').strip() and os.getenv('SPOTIFY_CLIENT_SECRET', '').strip()):
        return spotify_public_resolve(kind, identifier)
    try:
        return spotify_api_resolve(kind, identifier)
    except SourceError as error:
        if any(f'HTTP {status}' in str(error) for status in (401, 403, 404)):
            logging.getLogger(__name__).warning('Spotify API unavailable; trying public embed metadata')
            return spotify_public_resolve(kind, identifier)
        raise


def spotify_api_resolve(kind, identifier):
    headers = {**HEADERS, 'Authorization': 'Bearer ' + spotify_token()}

    def fetch(path):
        response = requests.get('https://api.spotify.com/v1/' + path, headers=headers, timeout=HTTP_TIMEOUT)
        if response.status_code != 200:
            raise SourceError(f'Spotify devolvió HTTP {response.status_code}. Comprueba que el enlace es público y tu aplicación tiene acceso a este recurso.')
        return response.json()

    info = fetch(f'{kind}s/{identifier}')
    if kind == 'track':
        return info['name'], [spotify_track(info)]
    page = info.get('tracks') or fetch(f'playlists/{identifier}/items')
    items = []
    while True:
        for row in page.get('items', []):
            item = (row.get('track') or row.get('item')) if kind == 'playlist' else row
            if item and not item.get('is_local') and item.get('type', 'track') == 'track':
                items.append(spotify_track(item, info if kind == 'album' else None))
            if len(items) >= MAX_ITEMS:
                break
        next_url = page.get('next')
        if len(items) >= MAX_ITEMS or not next_url:
            break
        if not next_url.startswith('https://api.spotify.com/v1/'):
            break
        page = fetch(next_url.removeprefix('https://api.spotify.com/v1/'))
    if not items:
        raise SourceError('La lista de Spotify está vacía o no es accesible con estas credenciales.')
    return info.get('name', 'Spotify'), items


def resolve(query, playlist=False):
    provider = source_type(query)
    if provider == 'spotify':
        return spotify_resolve(query)
    if provider == 'deezer':
        return deezer_resolve(query)
    return extract_online(query, playlist=playlist)


def search(query):
    if source_type(query) != 'search':
        raise SourceError('Para buscar escribe un artista o canción. Los enlaces se convierten desde la pestaña Enlace.')
    return extract_online(query, search_limit=8)[1]


def enrich(track, include_lyrics):
    """Metadata failures must never discard a successfully downloaded song."""
    warnings = []
    if not track.get('album'):
        try:
            results = get_json('https://itunes.apple.com/search', params={
                'term': f"{track['artist']} {track['title']}", 'entity': 'song', 'limit': 5,
            }).get('results', [])
            # Only accept reasonably matching title/artist, never the first arbitrary hit.
            from difflib import SequenceMatcher
            best = max(results, key=lambda r: SequenceMatcher(None, track['title'].lower(), r.get('trackName', '').lower()).ratio(), default=None)
            if best and SequenceMatcher(None, track['title'].lower(), best.get('trackName', '').lower()).ratio() > .75 and SequenceMatcher(None, track['artist'].lower(), best.get('artistName', '').lower()).ratio() > .65:
                for field, key in [('album', 'collectionName'), ('genre', 'primaryGenreName'), ('track_number', 'trackNumber')]:
                    track[field] = track.get(field) or best.get(key, '')
                track['year'] = track.get('year') or best.get('releaseDate', '')[:4]
                track['cover'] = best.get('artworkUrl100', track.get('cover', '')).replace('100x100bb', '600x600bb')
        except (requests.RequestException, ValueError, KeyError):
            warnings.append('No se pudieron consultar las etiquetas adicionales.')
    if include_lyrics:
        try:
            data = get_json('https://lrclib.net/api/get', params={
                'track_name': track['title'], 'artist_name': track['artist'],
            })
            track['lyrics'] = data.get('plainLyrics') or data.get('syncedLyrics') or ''
            if not track['lyrics']:
                warnings.append('No se encontraron letras para esta canción.')
        except (requests.RequestException, ValueError, KeyError):
            warnings.append('Letras no disponibles para esta canción.')
    return warnings
