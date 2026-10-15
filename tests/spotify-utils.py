"""Browser checks for the Spotify Utils adapter without depending on provider uptime."""
import json,os,subprocess,tempfile
from pathlib import Path
from urllib.parse import parse_qs,urlsplit
from playwright.sync_api import sync_playwright
base=os.environ.get('BPM_TEST_BASE_URL','http://127.0.0.1:8080').rstrip('/')
with tempfile.TemporaryDirectory() as temp,sync_playwright() as p:
 fixture=Path(temp)/'tone.mp3'
 subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=3','-c:a','libmp3lame',str(fixture)],check=True)
 mp3=fixture.read_bytes()
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 state={'search_error':False,'hold':False,'unsafe':False};requests=[];held=[]
 page.on('request',lambda request:requests.append(request.url))
 def api(route):
  request=route.request;path=urlsplit(request.url).path
  headers={'access-control-allow-origin':'*'}
  if path=='/api/search':
   if state['search_error']:route.fulfill(status=502,headers=headers,json={'success':False,'error':'Provider unavailable'});return
   route.fulfill(headers=headers,json={'success':True,'items':[{'title':'Track & One','artist':'Author','album':'Album','duration':'0:03'},{'title':'<img src=x onerror=alert(1)>','artist':'Untrusted','duration':'0:03'}]});return
  if path=='/api/download' and request.method=='POST':
   assert parse_qs(request.post_data)=={'title':['Track & One'],'artist':['Author']}
   assert 'application/x-www-form-urlencoded' in request.headers['content-type']
   if state['hold']:held.append(route);return
   route.fulfill(headers=headers,json={'success':True,'title':'Track & One','artist':'Author','streamUrl':'https://unapproved.example/audio' if state['unsafe'] else '/api/file?title=Track%20%26%20One&artist=Author'});return
  if path in ['/api/stream','/api/file']:route.fulfill(headers=headers,content_type='audio/mpeg',body=mp3);return
  raise AssertionError(request.url)
 page.route('https://alokhamil.my.id/api/**',api)
 page.goto(base+'/spotify-utils/?embed=1',wait_until='load')
 page.locator('#query').fill('Track & One')
 page.locator('#search').click()
 page.locator('.track').first.wait_for()
 assert page.locator('.track').count()==2
 assert page.locator('.track-title').nth(1).inner_text()=='<img src=x onerror=alert(1)>'
 assert page.locator('.track-title img').count()==0
 first=page.locator('.track').first
 first.get_by_role('button',name='Escuchar Track & One de Author',exact=True).click()
 page.wait_for_function("document.getElementById('audio').readyState>=2&&!document.getElementById('audio').paused")
 assert page.locator('#next').is_enabled()
 page.locator('#audio').evaluate('(a)=>a.pause()')
 first.get_by_role('button',name='Preparar MP3 de Track & One de Author',exact=True).click()
 page.locator('#save').wait_for(state='visible')
 with page.expect_download() as event:page.locator('#save').click()
 output=Path(temp)/'download.mp3';event.value.save_as(str(output))
 assert output.read_bytes()==mp3
 assert event.value.suggested_filename=='Author - Track & One.mp3'
 state['hold']=True
 first.get_by_role('button',name='Preparar MP3 de Track & One de Author',exact=True).click()
 page.locator('#cancel-download').wait_for(state='visible')
 page.locator('#cancel-download').click()
 assert page.locator('#save').is_hidden()
 assert page.locator('#save').get_attribute('href') is None
 assert 'cancelada' in page.locator('#download-status').inner_text()
 for route in held:route.abort()
 state['hold']=False;state['unsafe']=True
 first.get_by_role('button',name='Preparar MP3 de Track & One de Author',exact=True).click()
 page.locator('#download-status.error').wait_for()
 assert 'no admitida' in page.locator('#download-status').inner_text()
 assert not any('unapproved.example' in url for url in requests)
 state['search_error']=True
 page.locator('#search').click()
 page.locator('#search-status.error').wait_for()
 assert page.locator('#search').is_enabled()
 assert page.locator('#results').is_hidden()
 page.locator('#close-player').click()
 assert page.locator('#audio').get_attribute('src') is None
 assert page.locator('#player').is_hidden()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 browser.close()
 print('Resultados seguros, reproducción, MP3, cancelación, rutas del proveedor, errores y vista móvil: OK')
