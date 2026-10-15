from unittest.mock import Mock
import pytest
from app import create_app
ORIGIN='https://jcarlos1215.github.io'
HEADERS={'Origin':ORIGIN,'X-Requested-With':'AllToMP3'}
@pytest.fixture
def application(tmp_path):
 app=create_app(tmp_path)
 yield app
 app.extensions['jobs'].executor.shutdown(wait=True)
def test_preflight_only_trusted_origins(application):
 c=application.test_client();r=c.options('/api/media/jobs',headers={'Origin':ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type,X-Requested-With'})
 assert r.status_code==200 and r.headers['Access-Control-Allow-Origin']==ORIGIN
 assert 'X-Requested-With' in r.headers['Access-Control-Allow-Headers']
 assert 'Access-Control-Allow-Origin' not in c.options('/api/media/jobs',headers={'Origin':'https://evil.example'}).headers
@pytest.mark.parametrize('url',['https://www.youtube.com/watch?v=jNQXAC9IVRw','https://soundcloud.com/artist/track'])
def test_media_accepts_supported_link_without_changing_legacy_security(application,url):
 create=Mock(return_value={'id':'a'*32,'status':'queued','tracks':[]});application.extensions['jobs'].create=create;c=application.test_client()
 r=c.post('/api/media/jobs',headers=HEADERS,json={'url':url,'bitrate':192,'playlist':False})
 assert r.status_code==202 and create.call_args.args==(url,{'bitrate':192,'playlist':False,'tags':True,'lyrics':False})
 assert c.post('/api/jobs',headers=HEADERS,json={'query':url}).status_code==403
 assert c.post('/api/media/jobs',headers={**HEADERS,'Origin':'https://evil.example'},json={'url':url}).status_code==403
 assert c.post('/api/media/jobs',headers={'Origin':ORIGIN},json={'url':url}).status_code==403
@pytest.mark.parametrize('url',['https://127.0.0.1/file','https://youtube.com.evil.example/file','https://open.spotify.com/track/test','song title','file:///etc/passwd'])
def test_media_rejects_unrelated_urls(application,url):
 create=Mock();application.extensions['jobs'].create=create
 assert application.test_client().post('/api/media/jobs',headers=HEADERS,json={'url':url}).status_code==400
 create.assert_not_called()
def test_job_and_download_routes(application,tmp_path):
 store=application.extensions['jobs'];store.get=Mock(return_value={'id':'a'*32,'status':'completed'});store.cancel=Mock(return_value={'status':'cancelled'})
 audio=tmp_path/'sample.mp3';audio.write_bytes(b'ID3fixture');store.track_file=Mock(return_value=(audio,'sample.mp3'));c=application.test_client()
 assert c.get('/api/media/jobs/'+'a'*32,headers={'Origin':ORIGIN}).json['job']['status']=='completed'
 assert c.post('/api/media/jobs/'+'a'*32+'/cancel',headers=HEADERS).json['job']['status']=='cancelled'
 r=c.get('/api/media/jobs/'+'a'*32+'/tracks/0/download',headers={'Origin':ORIGIN})
 assert r.status_code==200 and r.data==b'ID3fixture' and r.headers['Access-Control-Allow-Origin']==ORIGIN
