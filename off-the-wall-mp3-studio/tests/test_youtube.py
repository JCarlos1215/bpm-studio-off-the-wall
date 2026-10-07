from pathlib import Path
from unittest.mock import Mock

import pytest

import engine
import providers


@pytest.fixture(autouse=True)
def no_server_session(monkeypatch):
    monkeypatch.delenv('YTDLP_COOKIES_FILE', raising=False)


def test_search_does_not_extract_each_player(monkeypatch):
    downloader = Mock()
    downloader.extract_info.return_value = {'entries': [{'id': 'test', 'title': 'Artist - Song'}]}
    factory = Mock()
    factory.return_value.__enter__ = Mock(return_value=downloader)
    factory.return_value.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(providers, 'YoutubeDL', factory)
    _, tracks = providers.extract_online('Artist Song audio')
    assert factory.call_args.args[0]['extract_flat'] is True
    assert downloader.extract_info.call_args.args[0] == 'ytsearch1:Artist Song audio'
    assert tracks[0]['source_url'] == 'https://www.youtube.com/watch?v=test'


def test_session_uses_private_temporary_copy(tmp_path, monkeypatch):
    secret = tmp_path / 'secret.txt'
    secret.write_text('# Netscape HTTP Cookie File\n')
    secret.chmod(0o400)
    monkeypatch.setenv('YTDLP_COOKIES_FILE', str(secret))
    factory = Mock()
    factory.return_value.__enter__ = Mock(return_value='downloader')
    factory.return_value.__exit__ = Mock(return_value=False)
    with providers.open_downloader({'quiet': True}, factory=factory) as downloader:
        assert downloader == 'downloader'
        copy = Path(factory.call_args.args[0]['cookiefile'])
        assert copy != secret
        assert copy.read_text() == secret.read_text()
        assert copy.stat().st_mode & 0o777 == 0o600
        copy.write_text('updated session')
    assert not copy.exists()
    assert secret.read_text() == '# Netscape HTTP Cookie File\n'


def test_session_copy_deleted_on_failure(tmp_path, monkeypatch):
    secret = tmp_path / 'secret.txt'
    secret.write_text('# Netscape HTTP Cookie File\n')
    monkeypatch.setenv('YTDLP_COOKIES_FILE', str(secret))
    factory = Mock()
    factory.return_value.__enter__ = Mock(return_value='downloader')
    factory.return_value.__exit__ = Mock(return_value=False)
    with pytest.raises(RuntimeError):
        with providers.open_downloader({}, factory=factory):
            copy = Path(factory.call_args.args[0]['cookiefile'])
            raise RuntimeError('Download failed')
    assert not copy.exists()


def test_missing_session_has_error_without_private_path(monkeypatch):
    monkeypatch.setenv('YTDLP_COOKIES_FILE', '/private/not-present/session.txt')
    with pytest.raises(providers.SourceError) as exc:
        with providers.open_downloader({}):
            pytest.fail('Missing session must fail')
    assert 'YTDLP_COOKIES_FILE' in str(exc.value)
    assert '/private/' not in str(exc.value)


def test_unconfigured_session_does_not_create_cookies():
    factory = Mock()
    factory.return_value.__enter__ = Mock(return_value='downloader')
    factory.return_value.__exit__ = Mock(return_value=False)
    with providers.open_downloader({'quiet': True}, factory=factory):
        assert factory.call_args.args[0]['quiet'] is True
        assert 'cookiefile' not in factory.call_args.args[0]


def test_youtube_challenge_error_is_distinct_from_other_errors(monkeypatch):
    error = ValueError("ERROR: [youtube] Sign in to confirm you're not a bot")
    assert 'servidor' in engine.readable_error(error)
    assert 'Spotify' not in engine.readable_error(error)
    monkeypatch.setenv('YTDLP_COOKIES_FILE', '/private/session.txt')
    assert 'rechazó la sesión' in engine.readable_error(error)
    assert engine.readable_error(ValueError('robot dance not available')) == 'robot dance not available'


def test_transport_warning_survives_player_error(monkeypatch):
    from yt_dlp.utils import DownloadError
    factory = Mock()
    downloader = Mock()
    factory.return_value.__enter__ = Mock(return_value=downloader)
    factory.return_value.__exit__ = Mock(return_value=False)
    def fail(*args, **kwargs):
        factory.call_args.args[0]['logger'].warning('Unable to download webpage: HTTP Error 429: Too Many Requests https://host.example/?token=secret')
        raise DownloadError('Failed to extract any player response')
    downloader.extract_info.side_effect = fail
    monkeypatch.setattr(providers, 'YoutubeDL', factory)
    with pytest.raises(providers.SourceError) as error:
        providers.extract_online('https://www.youtube.com/watch?v=test')
    assert '429' in str(error.value)
    assert 'secret' not in str(error.value)
    assert 'HTTP 429' in engine.readable_error(error.value)


def test_youtube_limit_pauses_requests(monkeypatch):
    monkeypatch.setattr(providers, '_youtube_retry_at', 0)
    monkeypatch.setattr(providers.time, 'monotonic', lambda: 100)
    providers.record_youtube_limit('ERROR: [youtube] Failed player response | HTTP Error 429')
    assert providers.youtube_cooldown_remaining() == 900
    with pytest.raises(providers.SourceError, match='429'):
        providers.check_youtube_cooldown('https://www.youtube.com/watch?v=test')
    providers.check_youtube_cooldown('https://soundcloud.com/studio/track')


@pytest.mark.parametrize('candidate, accepted', [
    ({'title':'Song', 'artist':'Artist', 'duration':200}, True),
    ({'title':'Artist - Song', 'artist':'Uploader', 'duration':200}, True),
    ({'title':'Song', 'artist':'Other person', 'duration':200}, False),
    ({'title':'Artist - Song Remix', 'artist':'Artist', 'duration':200}, False),
    ({'title':'Song', 'artist':'Artist', 'duration':30}, False),
    ({'title':'Song', 'artist':'Artist', 'duration':0}, False),
])
def test_equivalent_match_rejects_wrong_versions(candidate, accepted):
    assert bool(providers.equivalent_score({'title':'Song', 'artist':'Artist', 'duration':200}, candidate)) is accepted


def test_remix_matches_collaborators_in_title():
    track = {'title': 'Los Luchadores - Remix', 'artist': 'Gletzzi, Off The Wall', 'duration':317.76}
    candidate = {'title':'Conjunto África - Los Luchadores (Gletzzi & Off The Wall Remix)', 'artist':'GLETZZI (MX)', 'duration':317.806}
    assert providers.equivalent_score(track, candidate) > 0
    candidate['title'] = 'Conjunto África - Los Luchadores (Gletzzi Remix)'
    assert providers.equivalent_score(track, candidate) == 0
    candidate['title'] = 'Conjunto África - Los Luchadores (Gletzzi & Off The Wall Remix)'
    candidate['duration'] = 30
    assert providers.equivalent_score(track, candidate) == 0


def test_combined_failure_keeps_both_provider_causes():
    message = 'No se encontró una fuente completa y accesible que coincida con esta canción. YouTube HTTP 429. SoundCloud sin coincidencias.'
    assert engine.readable_error(providers.SourceError(message)) == message


def test_artist_search_falls_back_to_soundcloud(monkeypatch):
    monkeypatch.setattr(providers, 'extract_online', Mock(side_effect=providers.SourceError('YouTube HTTP 429')))
    tracks = [{'title':'Song', 'source':'soundcloud', 'source_url':'https://soundcloud.com/studio/song'}]
    fallback = Mock(return_value=tracks)
    monkeypatch.setattr(providers, 'soundcloud_search', fallback)
    assert providers.search('Skrillex') == tracks
    fallback.assert_called_once_with('Skrillex')


def test_search_preserves_youtube_results(monkeypatch):
    tracks = [{'source':'youtube'}]
    monkeypatch.setattr(providers, 'extract_online', Mock(return_value=('Search', tracks)))
    monkeypatch.setattr(providers, 'soundcloud_search', Mock(side_effect=AssertionError('Unneeded fallback')))
    assert providers.search('Skrillex') == tracks


def test_empty_fallback_explains_both_sources(monkeypatch):
    monkeypatch.setattr(providers, 'extract_online', Mock(side_effect=providers.SourceError('YouTube HTTP 429')))
    monkeypatch.setattr(providers, 'soundcloud_search', Mock(return_value=[]))
    with pytest.raises(providers.SourceError, match='SoundCloud no encontró'):
        providers.search('Unknown artist')
