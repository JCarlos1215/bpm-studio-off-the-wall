import json
from unittest.mock import Mock

import pytest
import requests

import providers

URL = 'https://open.spotify.com/playlist/PublicList?si=share'
ROW = {'uri': 'spotify:track:Song123', 'title': 'Canción', 'subtitle': 'Artista', 'duration': 210000}


@pytest.fixture(autouse=True)
def no_credentials(monkeypatch):
    monkeypatch.delenv('SPOTIFY_CLIENT_ID', raising=False)
    monkeypatch.delenv('SPOTIFY_CLIENT_SECRET', raising=False)


def embed(monkeypatch, entity):
    data = {'props': {'pageProps': {'state': {'data': {'entity': entity}}}}}
    response = Mock(text='<script type="application/json" id="__NEXT_DATA__">' + json.dumps(data) + '</script>')
    get = Mock(return_value=response)
    monkeypatch.setattr(providers.requests, 'get', get)
    return get


def test_public_playlist_without_credentials(monkeypatch):
    get = embed(monkeypatch, {'id': 'PublicList', 'type': 'playlist', 'name': 'Lista', 'trackList': [ROW]})
    monkeypatch.setattr(providers.requests, 'post', Mock(side_effect=AssertionError('Token request')))
    title, tracks = providers.resolve(URL, playlist=True)
    assert title == 'Lista'
    assert len(tracks) == 1
    assert tracks[0]['title'] == 'Canción'
    assert tracks[0]['artist'] == 'Artista'
    assert tracks[0]['duration'] == 210
    assert tracks[0]['source'] == 'spotify'
    assert tracks[0]['source_url'] == 'https://open.spotify.com/track/Song123'
    assert tracks[0]['album'] == ''
    assert get.call_args.args[0] == 'https://open.spotify.com/embed/playlist/PublicList'


@pytest.mark.parametrize('kind', ['track', 'album'])
def test_public_song_and_album(monkeypatch, kind):
    entity = {'id': 'Item123', 'type': kind, 'name': 'Nombre'}
    if kind == 'track':
        entity.update(ROW, uri='spotify:track:Item123', artists=[{'name': 'Artista'}], subtitle=None,
                      visualIdentity={'image': [{'url': 'https://i.scdn.co/image/cover'}]},
                      releaseDate={'isoString': '2026-01-01'})
    else:
        entity['trackList'] = [ROW]
    embed(monkeypatch, entity)
    _, tracks = providers.spotify_resolve(f'https://open.spotify.com/intl-es/{kind}/Item123')
    assert tracks[0]['artist'] == 'Artista'
    if kind == 'track':
        assert tracks[0]['year'] == '2026'
        assert tracks[0]['cover'] == 'https://i.scdn.co/image/cover'
    else:
        assert tracks[0]['album'] == 'Nombre'


def test_skip_nonmusic_and_enforce_limit(monkeypatch):
    embed(monkeypatch, {'id': 'PublicList', 'type': 'playlist', 'trackList': [
        {'uri': 'spotify:episode:Episode123', 'title': 'Podcast', 'subtitle': 'Autor'},
        {**ROW, 'uri': 'spotify:local:artist:album:song'}, {}, ROW, ROW,
    ]})
    monkeypatch.setattr(providers, 'MAX_ITEMS', 1)
    assert len(providers.spotify_resolve(URL)[1]) == 1


@pytest.mark.parametrize('text', ['<html>Private playlist</html>', '<script id="__NEXT_DATA__">{bad}</script>',
                                   '<script id="__NEXT_DATA__">{"props":{"pageProps":{"status":500}}}</script>'])
def test_unavailable_embed_has_actionable_error(monkeypatch, text):
    monkeypatch.setattr(providers.requests, 'get', Mock(return_value=Mock(text=text)))
    with pytest.raises(providers.SourceError, match='lista sea pública'):
        providers.spotify_resolve(URL)


def test_network_failure_has_actionable_error(monkeypatch):
    monkeypatch.setattr(providers.requests, 'get', Mock(side_effect=requests.Timeout))
    with pytest.raises(providers.SourceError, match='Spotify no publica'):
        providers.spotify_resolve(URL)


def test_empty_or_wrong_entity_rejected(monkeypatch):
    for entity in [{'id': 'Other', 'type': 'playlist', 'trackList': [ROW]},
                   {'id': 'PublicList', 'type': 'playlist', 'trackList': []}]:
        embed(monkeypatch, entity)
        with pytest.raises(providers.SourceError):
            providers.spotify_resolve(URL)


def test_configured_credentials_keep_api_and_pagination(monkeypatch):
    monkeypatch.setenv('SPOTIFY_CLIENT_ID', 'test-client')
    monkeypatch.setenv('SPOTIFY_CLIENT_SECRET', 'test-secret')
    post = Mock(return_value=Mock(status_code=200, json=lambda: {'access_token': 'test-token'}))
    api_track = {'name': 'Canción', 'artists': [{'name': 'Artista'}], 'type': 'track',
                 'external_urls': {'spotify': 'https://open.spotify.com/track/Song123'}}
    get = Mock(side_effect=[
        Mock(status_code=200, json=lambda: {'name': 'Lista API', 'tracks': {'items': [{'track': api_track}],
             'next': 'https://api.spotify.com/v1/playlists/PublicList/items?offset=1'}}),
        Mock(status_code=200, json=lambda: {'items': [{'item': api_track}], 'next': None}),
    ])
    monkeypatch.setattr(providers.requests, 'post', post)
    monkeypatch.setattr(providers.requests, 'get', get)
    title, tracks = providers.spotify_resolve(URL)
    assert title == 'Lista API'
    assert len(tracks) == 2
    assert get.call_args.kwargs['headers']['Authorization'] == 'Bearer test-token'
    assert post.call_args.kwargs['auth'] == ('test-client', 'test-secret')


def test_incomplete_credentials_use_public_embed(monkeypatch):
    monkeypatch.setenv('SPOTIFY_CLIENT_ID', 'test-client')
    embed(monkeypatch, {'id': 'PublicList', 'type': 'playlist', 'trackList': [ROW]})
    assert len(providers.spotify_resolve(URL)[1]) == 1
