from unittest.mock import Mock
import threading
import pytest
import apify_media as adapter
import engine

@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv('APIFY_TOKEN', 'test-server-secret')
    monkeypatch.setenv('APIFY_TASK_ID', 'task123')
    monkeypatch.setenv('APIFY_DOWNLOAD_HOSTS', 'bucket.example.org')


def test_unconfigured_api_does_not_charge(tmp_path, monkeypatch):
    from app import create_app
    monkeypatch.delenv('APIFY_TOKEN', raising=False)
    app = create_app(tmp_path)
    try:
        client = app.test_client()
        assert client.get('/api/media/config').json['configured'] is False
        create = Mock()
        app.extensions['jobs'].create = create
        result = client.post('/api/media/jobs', json={'url':'https://youtube.com/watch?v=jNQXAC9IVRw'}, headers={'X-Requested-With':'AllToMP3'})
        assert result.status_code == 503
        create.assert_not_called()
    finally:
        app.extensions['jobs'].executor.shutdown(wait=True)


def test_credentials_not_in_response(configured):
    assert adapter.configuration()['configured'] is True
    assert 'test-server-secret' not in str(adapter.configuration())


@pytest.mark.parametrize('url', ['http://bucket.example.org/a.mp3','https://evil.example/a.mp3','https://bucket.example.org@evil.example/a.mp3','https://bucket.example.org:8080/a.mp3'])
def test_storage_url_rejected_before_fetch(configured, monkeypatch, tmp_path, url):
    fetch = Mock()
    monkeypatch.setattr(adapter.requests, 'get', fetch)
    with pytest.raises(ValueError): adapter.download(url, tmp_path/'audio.mp3', lambda: None)
    fetch.assert_not_called()


def test_task_validation_precedes_paid_run(configured, monkeypatch, tmp_path):
    api = Mock(return_value={'actId':'different-actor'})
    monkeypatch.setattr(adapter, 'api', api)
    with pytest.raises(ValueError): adapter.run(Mock(), 'job', tmp_path, threading.Event(), lambda: None)
    assert api.call_count == 1


def test_successful_transfer_and_conversion(configured, monkeypatch, tmp_path):
    job = {'query':'https://www.youtube.com/watch?v=jNQXAC9IVRw','options':{'bitrate':192},'status':'processing'}
    store = Mock()
    store.get.side_effect = lambda _: job
    def update(_, index=None, **fields):
        if index is None: job.update(fields)
        else: job['tracks'][index].update(fields)
    store.update.side_effect = update
    api = Mock(side_effect=[{'actId':adapter.ACTOR_ID}, {'id':'run123','status':'SUCCEEDED','defaultDatasetId':'dataset123'}, [{'title':'Fixture','downloadUrl':'https://bucket.example.org/audio.mp3'}]])
    monkeypatch.setattr(adapter,'api',api)
    monkeypatch.setattr(adapter,'download',lambda url,path,check:path.write_bytes(b'fixture'))
    monkeypatch.setattr(engine,'MP3',lambda path:Mock(info=Mock(length=10)))
    monkeypatch.setattr(engine,'convert_file',lambda source,target,*args,**kwargs:target.write_bytes(b'converted'))
    adapter.run(store,'job',tmp_path,threading.Event(),lambda:None)
    assert job['status']=='completed' and job['tracks'][0]['file']=='0000.mp3'
    paid = api.call_args_list[1]
    assert paid.kwargs['params']['maxTotalChargeUsd']=='0.50'
    assert paid.kwargs['json']['proxyConfiguration']=={'useApifyProxy':False}
    assert paid.kwargs['json']['startUrls']==[{'url':job['query']}]


def test_bad_output_aborts_run(configured, monkeypatch, tmp_path):
    store=Mock();store.get.return_value={'query':'https://youtu.be/jNQXAC9IVRw','options':{'bitrate':128},'status':'processing'}
    api=Mock(side_effect=[{'actId':adapter.ACTOR_ID},{'id':'run123','status':'SUCCEEDED','defaultDatasetId':'dataset123'},[{'title':'No file'}],{}])
    monkeypatch.setattr(adapter,'api',api)
    with pytest.raises(ValueError, match='enlace de audio'): adapter.run(store,'job',tmp_path,threading.Event(),lambda:None)
    assert api.call_args.args==('POST','/actor-runs/run123/abort')


def test_paid_admission_cap_and_canonical_video(configured, tmp_path):
    import time
    from app import create_app
    app = create_app(tmp_path)
    try:
        store = app.extensions['jobs']
        store.create = Mock(return_value={'id':'a'*32, 'status':'queued'})
        store.list = Mock(return_value=[])
        client=app.test_client()
        headers={'X-Requested-With':'AllToMP3'}
        r=client.post('/api/media/jobs',headers=headers,json={'url':'https://youtu.be/jNQXAC9IVRw?list=PLabcdefghijk'})
        assert r.status_code==202
        assert store.create.call_args.args[0]=='https://www.youtube.com/watch?v=jNQXAC9IVRw'
        assert store.create.call_args.args[1]['engine']=='apify'
        store.create.reset_mock()
        store.list.return_value=[{'created_at':time.time(),'options':{'engine':'apify'}}]*5
        assert client.post('/api/media/jobs',headers=headers,json={'url':'https://youtu.be/jNQXAC9IVRw'}).status_code==429
        store.create.assert_not_called()
        for url in ('https://soundcloud.com/artist/track','https://youtube.com/playlist?list=PLabcdefghijk'):
            assert client.post('/api/media/jobs',headers=headers,json={'url':url}).status_code==400
        store.create.assert_not_called()
    finally:
        app.extensions['jobs'].executor.shutdown(wait=True)
