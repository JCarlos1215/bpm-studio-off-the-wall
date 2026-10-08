import importlib.util
from pathlib import Path
import struct
from unittest.mock import Mock

import pytest

spec = importlib.util.spec_from_file_location('stem_bridge', Path(__file__).with_name('bridge.py'))
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


def test_cors_only_for_known_studio():
    client = bridge.app.test_client()
    assert client.get('/api/health', headers={'Origin':'https://evil.example'}).status_code == 403
    response = client.options('/api/jobs', headers={'Origin':'https://jcarlos1215.github.io'})
    assert response.status_code == 204
    assert response.headers['Access-Control-Allow-Origin'] == 'https://jcarlos1215.github.io'
    assert '*' not in response.headers['Access-Control-Allow-Origin']


def test_upload_requires_header_and_complete_stereo_frames():
    client = bridge.app.test_client()
    assert client.post('/api/jobs', data=b'0'*8).status_code == 403
    for data in (b'', b'0'*7):
        assert client.post('/api/jobs', data=data, headers={'X-Requested-With':'StemsStudio'}).status_code == 400


def test_lossless_protocol_parameters(monkeypatch):
    mock = Mock(return_value=Mock(status_code=202, json=lambda: {'id':'test-1','progress':{'stage':'queued'}}))
    monkeypatch.setattr(bridge,'upstream',mock)
    client = bridge.app.test_client()
    assert client.post('/api/jobs',data=struct.pack('<ff',.2,.3),headers={'X-Requested-With':'StemsStudio'}).status_code == 202
    params = mock.call_args.kwargs['params']
    assert params['format'] == 'f32le'
    assert params['output_format'] == 'pcm32'
    assert params['include_derived'] == 'true'


def test_wav_float_header():
    header=bridge.wav_header(44100,44100,2)
    assert len(header)==44
    assert struct.unpack_from('<H',header,20)[0] == 3
    assert struct.unpack_from('<I',header,40)[0] == 44100*8
    with pytest.raises(ValueError):
        bridge.wav_header(0,44100,2)


def test_strip_server_filesystem_paths():
    assert bridge.public({'result':{'stems':[{'path':'/private/file','name':'vocals'}]}}) == {'result':{'stems':[{'name':'vocals'}]}}


def test_job_id_validation():
    for invalid in ('..','bad/id','x'*32):
        with pytest.raises(Exception):
            bridge.job_id(invalid)
    assert bridge.job_id('abc123-1') == 'abc123-1'


def test_stream_contains_header_and_unchanged_float_samples(monkeypatch):
    pcm=struct.pack('<ffff',.25,-.25,1.2,-1.2)
    result={'format':'pcm32','frames':2,'channels':2,'sample_rate':44100,'stems':[{'name':'vocals','gain':1}]}
    upstream_job=Mock(json=lambda:{'progress':{'stage':'done'},'result':result})
    upstream_stem=Mock(iter_content=lambda size:iter([pcm]))
    monkeypatch.setattr(bridge,'upstream',Mock(side_effect=[upstream_job,upstream_stem]))
    response=bridge.app.test_client().get('/api/jobs/test-1/stems/vocals')
    assert response.status_code==200
    assert response.data[44:]==pcm
    assert len(response.data)==44+len(pcm)
    upstream_stem.close.assert_called_once()


def test_remote_requires_authentication_and_rejects_external_origins(monkeypatch):
    monkeypatch.setattr(bridge, 'REMOTE', True)
    monkeypatch.setattr(bridge, 'SECRET', 's' * 40)
    mock = Mock(return_value=Mock(json=lambda: {'device':'gpu'}))
    monkeypatch.setattr(bridge, 'upstream', mock)
    client = bridge.app.test_client()
    assert client.get('/api/health').status_code == 401
    assert client.get('/api/health', headers={'Authorization':'Bearer wrong'}).status_code == 401
    assert not mock.called
    auth = {'Authorization':'Bearer '+ 's'*40, 'Origin':'http://localhost'}
    assert client.get('/api/health', headers=auth).status_code == 200
    auth['Origin'] = 'https://evil.example'
    assert client.get('/api/health', headers=auth).status_code == 403


def test_signed_download_only_grants_exact_file_and_expires(monkeypatch):
    monkeypatch.setattr(bridge, 'REMOTE', True)
    monkeypatch.setattr(bridge, 'SECRET', 's' * 40)
    monkeypatch.setattr(bridge.time, 'time', lambda: 1000)
    path = '/api/jobs/test-1/stems/vocals'
    query = f'?expires=1200&signature={bridge.signature(path, 1200)}'
    client = bridge.app.test_client()
    assert client.get('/api/jobs/test-1' + query).status_code == 401
    assert client.get('/api/jobs/test-1/stems/drums' + query).status_code == 401
    assert client.get(path + '?expires=900&signature=' + bridge.signature(path, 900)).status_code == 401
    pcm = struct.pack('<ff', .2, -.2)
    result = {'format':'pcm32','frames':1,'channels':2,'sample_rate':44100,'stems':[{'name':'vocals','gain':1}]}
    monkeypatch.setattr(bridge, 'upstream', Mock(side_effect=[
        Mock(json=lambda:{'progress':{'stage':'done'},'result':result}),
        Mock(iter_content=lambda size:iter([pcm]))]))
    assert client.get(path + query).data[44:] == pcm


def test_remote_waveform_uses_real_pcm_even_when_chunks_split_samples(monkeypatch):
    pcm = struct.pack('<ffff', .25, -.5, 1.2, -.1)
    job = Mock(json=lambda:{'progress':{'stage':'done'},'result':{'format':'pcm32','frames':2,'channels':2}})
    stream = Mock(iter_content=lambda size:iter([pcm[:3],pcm[3:9],pcm[9:]]))
    monkeypatch.setattr(bridge, 'upstream', Mock(side_effect=[job, stream]))
    response = bridge.app.test_client().get('/api/jobs/test-1/peaks/vocals')
    assert response.status_code == 200
    peaks = response.json['peaks']
    assert len(peaks) == 700
    assert max(peaks) == pytest.approx(1.2)
    assert peaks[0] == .25
    stream.close.assert_called_once()


def test_encoded_upload_really_decodes_and_keeps_lossless_output(monkeypatch):
    import imageio_ffmpeg
    monkeypatch.setenv('FFMPEG_BINARY', imageio_ffmpeg.get_ffmpeg_exe())
    samples = struct.pack('<ff', .25, -.25) * 4410
    wav = bridge.wav_header(4410, 44100, 2) + samples
    submitted = []
    def submit(audio):
        submitted.append(audio.read())
        return Mock(status_code=202, json=lambda:{'id':'test-1','progress':{'stage':'queued'}})
    monkeypatch.setattr(bridge, 'submit', submit)
    client = bridge.app.test_client()
    response = client.post('/api/files', data=wav, headers={'X-Requested-With':'StemsStudio'})
    assert response.status_code == 202
    assert submitted == [samples]
    response = client.post('/api/files', data=b'not audio', headers={'X-Requested-With':'StemsStudio'})
    assert response.status_code == 400
    assert len(submitted) == 1
