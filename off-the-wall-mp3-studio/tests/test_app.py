import copy
import json
from pathlib import Path
import shutil
import struct
import threading
import time
import wave
import zipfile

from mutagen.mp3 import MP3
from mutagen.id3 import ID3
import pytest

from app import create_app
import engine
import providers

HEADERS = {'X-Requested-With': 'AllToMP3'}


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.delenv('APP_PASSWORD', raising=False)
    application = create_app(tmp_path)
    application.config['TESTING'] = True
    yield application
    application.extensions['jobs'].executor.shutdown(wait=True)


def wait_for(store, identifier):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        job = store.get(identifier)
        if job['status'] in engine.TERMINAL and identifier not in store.events:
            return job
        time.sleep(.025)
    raise AssertionError('The job did not finish')


def audio_fixture(path):
    import math
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(44100)
        output.writeframes(b''.join(struct.pack('<h', int(4000 * math.sin(2 * math.pi * 440 * t / 44100))) for t in range(44100)))


def mock_source(monkeypatch, tmp_path, count=2):
    fixture = tmp_path / 'test.wav'
    audio_fixture(fixture)
    track = {'title':'Prueba', 'artist':'Estudio', 'duration':1, 'album':'Sesiones',
             'genre':'Ambient', 'year':'2026', 'track_number':1, 'cover':'',
             'source':'youtube', 'source_url':'https://www.youtube.com/watch?v=fixture'}
    monkeypatch.setattr(providers, 'resolve', lambda *_: ('Playlist de prueba', [copy.deepcopy(track) for _ in range(count)]))
    monkeypatch.setattr(providers, 'enrich', lambda track, lyrics: (track.update(lyrics='Letra de prueba original') or []))

    class Downloader:
        def __init__(self, options):
            self.options = options
        def __enter__(self):
            return self
        def __exit__(self, *_):
            pass
        def extract_info(self, url, download):
            self.path = Path(self.options['outtmpl'].replace('%(ext)s','wav'))
            shutil.copyfile(fixture, self.path)
            for hook in self.options.get('progress_hooks', []):
                hook({'total_bytes':100, 'downloaded_bytes':100})
            return {'id':'fixture', 'title':'Estudio - Prueba', 'artist':'Estudio', 'track':'Prueba',
                    'duration':1,'webpage_url':url,'ext':'wav'}
        def prepare_filename(self, info):
            return str(self.path)

    monkeypatch.setattr(engine, 'YoutubeDL', Downloader)


def test_conversion_tag_download_zip_and_persistence(app, tmp_path, monkeypatch):
    mock_source(monkeypatch, tmp_path)
    client = app.test_client()
    response = client.post('/api/jobs', headers=HEADERS, json={'query':'https://www.youtube.com/playlist?list=fixture', 'options':{'playlist':True,'bitrate':256}})
    assert response.status_code == 202
    identifier = response.json['job']['id']
    store = app.extensions['jobs']
    job = wait_for(store, identifier)
    assert job['status'] == 'completed', job
    assert len(job['tracks']) == 2
    path, name = store.track_file(identifier,0)
    mp3 = MP3(path)
    assert abs(mp3.info.bitrate - 256000) < 4000
    assert str(mp3.tags['TIT2']) == 'Prueba'
    assert str(mp3.tags['TPE1']) == 'Estudio'
    assert str(mp3.tags['TALB']) == 'Sesiones'
    assert mp3.tags.getall('USLT')[0].text == 'Letra de prueba original'
    download = client.get(f'/api/jobs/{identifier}/tracks/0/download')
    assert download.status_code == 200
    assert 'attachment' in download.headers['Content-Disposition']
    archive = client.get(f'/api/jobs/{identifier}/archive')
    assert archive.status_code == 200
    import io
    with zipfile.ZipFile(io.BytesIO(archive.data)) as bundle:
        assert len(bundle.namelist()) == 2
        assert all(name.endswith('.mp3') for name in bundle.namelist())
    restored = engine.JobStore(tmp_path)
    assert restored.get(identifier)['status'] == 'completed'
    restored.executor.shutdown(wait=True)
    assert client.delete(f'/api/jobs/{identifier}', headers=HEADERS).status_code == 200
    assert not path.exists()


@pytest.mark.parametrize('query', ['http://localhost:8000','https://127.0.0.1','https://youtube.com.evil.example/watch','file:///etc/passwd','https://user:pass@youtube.com/watch','https://youtube.com:444/watch'])
def test_reject_untrusted_sources(app, query):
    response = app.test_client().post('/api/jobs', headers=HEADERS, json={'query':query})
    assert response.status_code == 400


def test_write_protection_and_validation(app):
    client = app.test_client()
    assert client.post('/api/jobs', json={'query':'Prueba'}).status_code == 403
    assert client.post('/api/jobs', headers={**HEADERS, 'Origin':'https://evil.example'}, json={'query':'Prueba'}).status_code == 403
    assert client.post('/api/jobs', headers=HEADERS, json={'query':'Prueba', 'options':{'bitrate':123}}).status_code == 400
    assert client.post('/api/jobs', headers=HEADERS, json={'query':'Prueba', 'options':{'tags':'true'}}).status_code == 400
    assert client.get('/api/jobs/missing').status_code == 404
    assert client.get('/').status_code == 200
    assert client.get('/api/status').json['ffmpeg'] is True


def test_failures_and_retry(app, monkeypatch):
    def fail(*args):
        raise providers.SourceError('Enlace privado')
    monkeypatch.setattr(providers, 'resolve', fail)
    client = app.test_client()
    response = client.post('/api/jobs', headers=HEADERS, json={'query':'Prueba'})
    identifier = response.json['job']['id']
    job = wait_for(app.extensions['jobs'], identifier)
    assert job['status'] == 'failed'
    assert job['error'] == 'Enlace privado'
    assert client.get(f'/api/jobs/{identifier}/archive').status_code == 400
    retry = client.post(f'/api/jobs/{identifier}/retry',headers=HEADERS,json={})
    assert retry.status_code == 202
    assert retry.json['job']['id'] != identifier
    wait_for(app.extensions['jobs'], retry.json['job']['id'])


def test_cancel_during_resolution(app, monkeypatch):
    entered, release = threading.Event(), threading.Event()
    def resolve(*args):
        entered.set()
        release.wait(5)
        return 'Prueba', []
    monkeypatch.setattr(providers, 'resolve', resolve)
    client = app.test_client()
    job = client.post('/api/jobs', headers=HEADERS, json={'query':'Prueba'}).json['job']
    assert entered.wait(3)
    response = client.post(f"/api/jobs/{job['id']}/cancel", headers=HEADERS, json={})
    assert response.json['job']['status'] == 'cancelled'
    assert client.delete(f"/api/jobs/{job['id']}",headers=HEADERS).status_code == 400
    release.set()
    assert wait_for(app.extensions['jobs'],job['id'])['status'] == 'cancelled'


def test_password(app, monkeypatch):
    monkeypatch.setenv('APP_PASSWORD','test-password')
    client = app.test_client()
    assert client.get('/api/status').status_code == 200
    assert client.get('/api/jobs').status_code == 401
    import base64
    auth = base64.b64encode(b'user:test-password').decode()
    assert client.get('/api/jobs',headers={'Authorization':'Basic ' + auth}).status_code == 200


def test_spotify_missing_credentials(monkeypatch):
    monkeypatch.delenv('SPOTIFY_CLIENT_ID',raising=False)
    monkeypatch.delenv('SPOTIFY_CLIENT_SECRET',raising=False)
    with pytest.raises(providers.SourceError,match='SPOTIFY_CLIENT_ID'):
        providers.spotify_resolve('https://open.spotify.com/track/example')


def test_restart_marks_interrupted_jobs_failed(tmp_path):
    store = engine.JobStore(tmp_path)
    job = {'id':'interrupted','query':'Prueba','title':'Prueba','status':'processing',
           'tracks':[{'status':'converting'}], 'created_at':0,'options':{'bitrate':256}}
    store._persist(job)
    store.executor.shutdown(wait=True)
    restored = engine.JobStore(tmp_path)
    assert restored.get('interrupted')['status'] == 'failed'
    assert restored.get('interrupted')['tracks'][0]['status'] == 'failed'
    restored.executor.shutdown(wait=True)
