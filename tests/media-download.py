import os,subprocess,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('BPM_TEST_BASE_URL','http://127.0.0.1:8080').rstrip('/')
with sync_playwright() as p,tempfile.TemporaryDirectory() as temp:
 fixture=Path(temp)/'tone.mp3';subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libmp3lame',str(fixture)],check=True);audio=fixture.read_bytes()
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));state={'mode':'ready','cancelled':False,'poll':0,'configured':True};identifier='a'*32
 def route(r):
  req=r.request;path=req.url.split('8093')[-1];headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,X-Requested-With'}
  if req.method=='OPTIONS':r.fulfill(headers=headers);return
  if path.endswith('/config'):r.fulfill(headers=headers,json={'provider':'apify','configured':state['configured'],'message':'Apify listo.' if state['configured'] else 'Apify pendiente de configurar.'});return
  if path.endswith('/download'):r.fulfill(headers=headers,content_type='audio/mpeg',body=audio);return
  if path.endswith('/cancel'):state['cancelled']=True;r.fulfill(headers=headers,json={'job':{'id':identifier,'status':'cancelled','tracks':[]}});return
  if req.method=='POST':
   assert req.post_data_json['url']=='https://youtu.be/jNQXAC9IVRw'
   state['poll']=0;r.fulfill(headers=headers,json={'job':{'id':identifier,'status':'queued','tracks':[]}});return
  state['poll']+=1
  if state['mode']=='error':job={'id':identifier,'status':'failed','error':'YouTube limita las solicitudes (HTTP 429).','tracks':[]}
  elif state['mode']=='hold':job={'id':identifier,'status':'processing','tracks':[{'title':'Fixture','status':'downloading','progress':20}]}
  else:job={'id':identifier,'title':'Fixture','status':'completed','tracks':[{'title':'Fixture','status':'completed','progress':100}]}
  r.fulfill(headers=headers,json={'job':job})
 page.route('http://127.0.0.1:8093/api/media/**',route)
 page.goto(base+'/spotify-utils/?embed=1',wait_until='load')
 page.locator('#media-url').fill('https://youtu.be/jNQXAC9IVRw');page.locator('#media-submit').click();page.locator('#media-save').wait_for(state='visible')
 with page.expect_download() as d:page.locator('#media-save').click()
 output=Path(temp)/'download.mp3';d.value.save_as(str(output));assert output.read_bytes()==audio
 assert page.locator('#stat-ready').inner_text()=='1'
 state['mode']='error';page.locator('#media-submit').click();page.locator('#media-status.error').wait_for()
 assert '429' in page.locator('#media-status').inner_text();assert page.locator('#media-save').is_hidden();assert page.locator('#stat-error').inner_text()=='1'
 state['mode']='hold';page.locator('#media-submit').click();page.wait_for_function("document.querySelector('#media-tracks li')?.textContent.includes('20%')")
 page.locator('#media-cancel').click();page.wait_for_function("!document.getElementById('media-submit').disabled")
 assert state['cancelled'];assert page.locator('#stat-processing').inner_text()=='0';assert page.locator('#media-save').is_hidden()
 state['configured']=False
 page.reload(wait_until='load');page.wait_for_function("document.querySelector('#media-status').textContent.includes('pendiente')")
 assert page.locator('#media-submit').is_disabled()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
 browser.close();print('Descarga MP3 intacta, progreso, contadores, HTTP 429 visible, cancelación y vista móvil: OK')
