from unittest.mock import Mock

import pytest
import providers

TRACK = {'id':123, 'title':'Song', 'duration':200, 'artist':{'name':'Artist'},
         'contributors':[{'name':'Artist'}, {'name':'Guest'}, {'name':'Artist'}],
         'album':{'title':'Album', 'cover_xl':'https://cdn.dzcdn.net/cover.jpg'},
         'release_date':'2022-01-01', 'preview':'https://cdn.dzcdn.net/preview.mp3'}


def test_deezer_track_metadata_never_uses_preview(monkeypatch):
    get = Mock(return_value=TRACK)
    monkeypatch.setattr(providers, 'get_json', get)
    title, tracks = providers.resolve('https://www.deezer.com/es/track/123?utm_source=share')
    assert title == 'Song'
    assert tracks[0]['artist'] == 'Artist, Guest'
    assert tracks[0]['source_url'] == 'https://www.deezer.com/track/123'
    assert tracks[0]['duration'] == 200
    assert tracks[0]['year'] == '2022'
    assert 'preview' not in tracks[0]


@pytest.mark.parametrize('kind', ['album', 'playlist'])
def test_deezer_collection_pages_and_limit(monkeypatch, kind):
    first = {'title':'Collection','cover_xl':'https://cdn.dzcdn.net/album.jpg',
             'tracks':{'data':[TRACK], 'next':f'https://api.deezer.com/{kind}/99/tracks?index=1'}}
    get = Mock(side_effect=[first, {'data':[{**TRACK,'id':124}, {**TRACK,'id':125}]}])
    monkeypatch.setattr(providers, 'get_json', get)
    monkeypatch.setattr(providers, 'MAX_ITEMS', 2)
    title, tracks = providers.resolve(f'https://www.deezer.com/{kind}/99', playlist=True)
    assert title == 'Collection'
    assert len(tracks) == 2
    assert tracks[1]['source_url'].endswith('/124')
    assert tracks[0]['album'] == ('Collection' if kind == 'album' else 'Album')


def test_deezer_sharing_redirect(monkeypatch):
    get = Mock(return_value=Mock(status_code=302,headers={'Location':'https://www.deezer.com/es/track/123'}))
    monkeypatch.setattr(providers.requests, 'get', get)
    monkeypatch.setattr(providers, 'get_json', Mock(return_value=TRACK))
    assert providers.resolve('https://link.deezer.com/s/fixture')[1][0]['title'] == 'Song'
    assert get.call_args.kwargs['allow_redirects'] is False


@pytest.mark.parametrize('target',['https://127.0.0.1/private','https://deezer.com.evil.example/track/123','https://user:pass@www.deezer.com/track/123'])
def test_deezer_redirect_cannot_request_untrusted_host(monkeypatch, target):
    get = Mock(return_value=Mock(status_code=302,headers={'Location':target}))
    monkeypatch.setattr(providers.requests, 'get', get)
    with pytest.raises(providers.SourceError):
        providers.resolve('https://deezer.page.link/fixture')
    assert get.call_count == 1


def test_deezer_pagination_rejects_external_host(monkeypatch):
    get = Mock(return_value={'tracks':{'data':[TRACK],'next':'https://api.deezer.com.evil.example/private'}})
    monkeypatch.setattr(providers, 'get_json', get)
    with pytest.raises(providers.SourceError, match='no válida'):
        providers.resolve('https://www.deezer.com/playlist/99')
    assert get.call_count == 1


def test_deezer_unavailable_collection(monkeypatch):
    monkeypatch.setattr(providers, 'get_json', Mock(return_value={'error':{'code':800}}))
    with pytest.raises(providers.SourceError, match='no pudo acceder'):
        providers.resolve('https://www.deezer.com/playlist/99')
