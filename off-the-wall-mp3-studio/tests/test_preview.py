from urllib.parse import urlparse, parse_qs
from unittest.mock import Mock

import pytest
import providers


@pytest.mark.parametrize('url', ['https://www.youtube.com/watch?v=YJVmu6yttiw', 'https://youtu.be/YJVmu6yttiw', 'https://www.youtube.com/shorts/YJVmu6yttiw'])
def test_youtube_preview_uses_selected_video(url):
    preview = providers.preview_url({'source_url':url})
    assert urlparse(preview).path == '/embed/YJVmu6yttiw'
    assert parse_qs(urlparse(preview).query)['autoplay'] == ['0']


def test_soundcloud_preview_keeps_track_and_strips_sharing_parameters():
    preview = providers.preview_url({'source_url':'https://soundcloud.com/artist/song?secret_token=private'})
    assert urlparse(preview).hostname == 'w.soundcloud.com'
    assert parse_qs(urlparse(preview).query)['url'] == ['https://soundcloud.com/artist/song']
    assert 'private' not in preview


@pytest.mark.parametrize('url',['https://youtube.com.evil.example/watch?v=YJVmu6yttiw','https://www.youtube.com/watch?v=bad','javascript:alert(1)','https://127.0.0.1/track'])
def test_preview_rejects_untrusted_or_invalid_sources(url):
    assert providers.preview_url({'source_url':url}) == ''


def test_waveform_search_uses_soundcloud_without_requesting_youtube(monkeypatch):
    tracks = [{'source_url':'https://soundcloud.com/artist/song','source':'soundcloud'}]
    search = Mock(return_value=tracks)
    monkeypatch.setattr(providers, 'soundcloud_search', search)
    monkeypatch.setattr(providers, 'extract_online', Mock(side_effect=AssertionError('Wrong provider')))
    assert providers.search('Artist Song', source='soundcloud') == tracks
    widget = providers.preview_url(tracks[0])
    assert parse_qs(urlparse(widget).query)['visual'] == ['false']


def test_search_rejects_unsupported_provider():
    with pytest.raises(providers.SourceError, match='Selecciona'):
        providers.search('Song', source='external-host')
