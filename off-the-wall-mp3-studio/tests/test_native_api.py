from unittest.mock import Mock
import threading
import pytest
from app import create_app
from engine import JobStore


def test_native_api_requires_no_paid_provider(tmp_path, monkeypatch):
    monkeypatch.setenv('BPM_MEDIA_ENGINE','native')
    monkeypatch.delenv('APIFY_TOKEN',raising=False)
    app=create_app(tmp_path)
    try:
        store=app.extensions['jobs'];store.create=Mock(return_value={'id':'a'*32,'status':'queued'})
        c=app.test_client();config=c.get('/api/media/config').json
        assert config['provider']=='native' and config['configured']
        for url in ['https://youtu.be/jNQXAC9IVRw','https://soundcloud.com/artist/track']:
            r=c.post('/api/media/jobs',json={'url':url},headers={'X-Requested-With':'AllToMP3'})
            assert r.status_code==202
            assert 'engine' not in store.create.call_args.args[1]
    finally:app.extensions['jobs'].executor.shutdown(wait=True)


def test_two_workers_and_hundred_request_queue(tmp_path,monkeypatch):
    monkeypatch.setenv('MAX_CONCURRENT_JOBS','2');monkeypatch.setenv('MAX_QUEUED_JOBS','100')
    started=threading.Barrier(3);release=threading.Event();lock=threading.Lock();counts={'active':0,'peak':0,'started':0}
    def work(self,identifier):
        with lock:
            counts['active']+=1;counts['peak']=max(counts['peak'],counts['active']);counts['started']+=1
            first=counts['started']<=2
        if first:started.wait(timeout=10)
        release.wait(timeout=10)
        with lock:counts['active']-=1
    monkeypatch.setattr(JobStore,'_run',work)
    store=JobStore(tmp_path)
    try:
        for _ in range(100):store.create('https://youtu.be/jNQXAC9IVRw',{'playlist':False})
        started.wait(timeout=10)
        assert counts['active']==2 and counts['peak']==2 and len(store.list())==100
        with pytest.raises(ValueError,match='cola'):store.create('https://youtu.be/jNQXAC9IVRw',{'playlist':False})
    finally:
        release.set();store.executor.shutdown(wait=True)
    assert counts['peak']==2


def test_hundred_worker_profile_schedules_hundred_jobs(tmp_path,monkeypatch):
    monkeypatch.setenv('MAX_CONCURRENT_JOBS','100');monkeypatch.setenv('MAX_QUEUED_JOBS','200')
    started=threading.Barrier(101);release=threading.Event()
    def work(self,identifier):
        started.wait(timeout=20)
        release.wait(timeout=20)
    monkeypatch.setattr(JobStore,'_run',work)
    store=JobStore(tmp_path)
    try:
        for _ in range(100):store.create('https://youtu.be/jNQXAC9IVRw',{'playlist':False})
        started.wait(timeout=20)
        assert len(store.list())==100 and store.concurrency==100
    finally:release.set();store.executor.shutdown(wait=True)
