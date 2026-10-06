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
        assert factory.call_args.args[0] == {'quiet': True}


def test_youtube_challenge_error_is_distinct_from_other_errors(monkeypatch):
    error = ValueError("ERROR: [youtube] Sign in to confirm you're not a bot")
    assert 'servidor' in engine.readable_error(error)
    assert 'Spotify' not in engine.readable_error(error)
    monkeypatch.setenv('YTDLP_COOKIES_FILE', '/private/session.txt')
    assert 'rechazó la sesión' in engine.readable_error(error)
    assert engine.readable_error(ValueError('robot dance not available')) == 'robot dance not available'
