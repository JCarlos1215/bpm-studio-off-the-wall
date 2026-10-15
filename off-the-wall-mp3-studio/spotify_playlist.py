"""Public Spotify playlist metadata only. Audio stays on the selected external provider."""
import json
import re
from urllib.parse import urlsplit

import requests
import providers

LIMIT = 50


def playlist_id(url):
    if not isinstance(url, str) or len(url) > 1000:
        raise ValueError('Introduce el enlace completo de una playlist pública de Spotify.')
    try:
        parsed = urlsplit(url.strip())
        match = re.fullmatch(r'/(?:intl-[a-z]{2}/)?playlist/([A-Za-z0-9]{22})/?', parsed.path)
        valid = parsed.scheme == 'https' and parsed.hostname == 'open.spotify.com' and parsed.port is None and not parsed.username and not parsed.password
    except ValueError:
        valid, match = False, None
    if not valid or not match:
        raise ValueError('Usa https://open.spotify.com/playlist/... de una playlist pública.')
    return match[1]


def resolve_playlist(url):
    identifier = playlist_id(url)
    response = requests.get(f'https://open.spotify.com/embed/playlist/{identifier}',
                            headers=providers.HEADERS, timeout=providers.HTTP_TIMEOUT)
    if response.status_code != 200 or len(response.content) > 4 * 1024 * 1024:
        raise ValueError('Spotify no pudo entregar los metadatos públicos de esta playlist.')
    try:
        parser = providers._SpotifyEmbedData()
        parser.feed(response.text)
        entity = json.loads(''.join(parser.parts))['props']['pageProps']['state']['data']['entity']
        if entity.get('type') != 'playlist' or entity.get('id') != identifier:
            raise ValueError('Playlist no válida.')
        rows = entity.get('trackList') or []
        tracks = []
        for row in rows:
            if not isinstance(row, dict) or not re.fullmatch(r'spotify:track:[A-Za-z0-9]{22}', row.get('uri', '')):
                continue
            title = row.get('title') or row.get('name')
            artist = ', '.join(a.get('name', '') for a in row.get('artists', []) if isinstance(a, dict)) or row.get('subtitle')
            if isinstance(title, str) and isinstance(artist, str) and title and artist:
                tracks.append({'title': title, 'artist': artist})
        if not tracks:
            raise ValueError('La playlist no publica canciones accesibles. Comprueba que sea pública.')
        return {'name': entity.get('name') or entity.get('title') or 'Playlist de Spotify',
                'tracks': tracks[:LIMIT], 'available': len(tracks), 'limit': LIMIT,
                'truncated': len(tracks) > LIMIT, 'source': 'spotify-public-embed'}
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise ValueError('No se pudo leer esta playlist. Las listas privadas o personalizadas pueden no ser accesibles.') from error
