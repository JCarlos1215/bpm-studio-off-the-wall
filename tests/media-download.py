import os,subprocess,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('BPM_TEST_BASE_URL','http://127.0.0.1:8080').rstrip('/')
with sync_playwright() as p,tempfile.TemporaryDirectory() as temp:
 fixture=Path(temp)/'tone.mp3';subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libmp3lame',str(fixture)],check=True);audio=fixture.read_bytes()
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));state={'mode':'ready','cancelled':False,'configured':True};jobs={}
 def route(r):
  req=r.request;path=req.url.split('8093')[-1];headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,X-Requested-With'}
  if req.method=='OPTIONS':r.fulfill(headers=headers);return
  if path.endswith('/config'):r.fulfill(headers=headers,json={'provider':'native','configured':state['configured'],'concurrency':2,'queue_limit':100,'message':'API propia lista.'});return
  if path.endswith('/download'):r.fulfill(headers=headers,content_type='audio/mpeg',body=audio);return
  if path.endswith('/cancel'):state['cancelled']=True;r.fulfill(headers=headers,json={'job':{'id':path.split('/')[-2],'status':'cancelled','tracks':[]}});return
  if req.method=='POST':
   assert req.post_data_json['url']=='https://youtu.be/jNQXAC9IVRw'
   identifier=f'{len(jobs)+1:032x}';jobs[identifier]={'mode':state['mode'],'poll':0};r.fulfill(headers=headers,json={'job':{'id':identifier,'status':'queued','tracks':[]}});return
  identifier=path.split('/')[-1];record=jobs[identifier];record['poll']+=1
  if record['mode']=='error':job={'id':identifier,'status':'failed','error':'YouTube no permitió descargar este enlace.','tracks':[]}
  elif record['mode']=='hold' or record['poll']==1:job={'id':identifier,'status':'processing','tracks':[{'title':'Fixture','status':'downloading','progress':20}]}
  else:job={'id':identifier,'title':'Fixture','status':'completed','tracks':[{'title':'Fixture','status':'completed','progress':100}]}
  r.fulfill(headers=headers,json={'job':job})
 page.route('http://127.0.0.1:8093/api/media/**',route)
 page.goto(base+'/spotify-utils/?embed=1',wait_until='load')
 page.locator('#media-url').fill('https://youtu.be/jNQXAC9IVRw');page.locator('#media-submit').click();page.locator('#media-submit').click()
 page.wait_for_function("document.querySelectorAll('.media-job').length===2")
 assert len(jobs)==2
 page.wait_for_function("[...document.querySelectorAll('.media-job a')].every(a=>!a.hidden)")
 assert page.locator('#stat-ready').inner_text()=='2'
 assert page.locator('#stat-processing').inner_text()=='0'
 with page.expect_download() as download:page.locator('.media-job a').first.click()
 saved=Path(temp)/'saved.mp3';download.value.save_as(saved);assert saved.read_bytes()==audio
 state['mode']='error';page.locator('#media-submit').click();page.locator('.media-job').first.get_by_text('YouTube no permitió descargar este enlace.',exact=True).wait_for()
 assert page.locator('#stat-error').inner_text()=='1'
 state['mode']='hold';page.locator('#media-submit').click();page.wait_for_function("document.querySelector('.media-job progress').value===20")
 page.locator('.media-job').first.get_by_role('button',name='Cancelar').click()
 page.locator('.media-job').first.get_by_text('Descarga cancelada.',exact=True).wait_for()
 assert state['cancelled'];assert page.locator('#stat-processing').inner_text()=='0'
 state['configured']=False;page.reload(wait_until='load');page.wait_for_function("document.querySelector('#media-status').classList.contains('error')")
 assert page.locator('#media-submit').is_disabled()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
 browser.close();print('Dos solicitudes simultáneas, MP3 intacto, contadores, error, cancelación y móvil: OK')
