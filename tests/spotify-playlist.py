import json,os,subprocess,tempfile,zipfile
from pathlib import Path
from urllib.parse import parse_qs,urlsplit,urlencode
from playwright.sync_api import sync_playwright
base=os.environ.get('BPM_TEST_BASE_URL','http://127.0.0.1:8080').rstrip('/')
with tempfile.TemporaryDirectory() as temp,sync_playwright() as p:
 fixture=Path(temp)/'tone.mp3';subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libmp3lame',str(fixture)],check=True);mp3=fixture.read_bytes()
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));state={'hold':False};held=[]
 def api(route):
  req=route.request;path=urlsplit(req.url).path;headers={'access-control-allow-origin':'*'}
  if path=='/api/search':route.fulfill(headers=headers,json={'success':True,'items':[{'title':'Uno','artist':'Autor'}]});return
  if path=='/api/download':
   title=parse_qs(req.post_data)['title'][0]
   if state['hold']:held.append(route);return
   if title=='Fallida':route.fulfill(status=502,headers=headers,json={'success':False,'error':'Fallo de prueba'});return
   route.fulfill(headers=headers,json={'success':True,'streamUrl':'/api/file?'+urlencode({'title':title})});return
  route.fulfill(headers=headers,content_type='audio/mpeg',body=mp3)
 page.route('https://alokhamil.my.id/api/**',api)
 page.route('https://jcarlos1215-bpm-studio-off-the-wall-mp3.onrender.com/api/spotify/playlist*',lambda r:r.fulfill(headers={'access-control-allow-origin':'*'},json={'name':'Lista ñ','tracks':[{'title':'Dós ñ','artist':'Autor'},{'title':'Fallida','artist':'Autor'}],'available':2,'truncated':False}))
 page.goto(base+'/spotify-utils/?embed=1',wait_until='load')
 assert page.locator('#stat-total').inner_text()=='0'
 page.locator('#query').fill('Uno');page.locator('#search').click();page.locator('.track').wait_for();page.get_by_role('button',name='Añadir a playlist',exact=True).click()
 page.locator('#playlist-link').fill('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');page.locator('#import-spotify').click()
 page.wait_for_function("document.querySelectorAll('#queue li').length===3")
 page.locator('#prepare-zip').click();page.locator('#save-zip').wait_for(state='visible')
 assert page.locator('#stat-total').inner_text()=='3'
 assert page.locator('#stat-ready').inner_text()=='2'
 assert page.locator('#stat-error').inner_text()=='1'
 assert page.locator('#stat-processing').inner_text()=='0'
 assert 'descarga parcial' in page.locator('#queue-status').inner_text()
 with page.expect_download() as d:page.locator('#save-zip').click()
 archive=Path(temp)/'playlist.zip';d.value.save_as(str(archive))
 assert d.value.suggested_filename=='Lista ñ.zip'
 with zipfile.ZipFile(archive) as z:
  assert z.testzip() is None
  assert z.namelist()==['001 - Autor - Uno.mp3','002 - Autor - Dós ñ.mp3','playlist.m3u8','reporte.txt']
  assert z.read(z.namelist()[0])==mp3
  assert z.read(z.namelist()[1])==mp3
  assert 'Fallida' in z.read('reporte.txt').decode()
  assert 'Fallida' not in z.read('playlist.m3u8').decode()
 # A cancelled batch cannot expose an old ZIP or leave conversions processing.
 state['hold']=True;page.locator('#prepare-zip').click();page.wait_for_function("document.getElementById('stat-processing').textContent==='1'")
 page.locator('#cancel-zip').click();page.wait_for_function("document.getElementById('stat-processing').textContent==='0'")
 assert page.locator('#save-zip').is_hidden();assert page.locator('#save-zip').get_attribute('href') is None
 assert page.locator('#prepare-zip').is_enabled()
 for route in held:route.abort()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 b.close();print('Playlist seleccionada/importada, contadores, ZIP válido UTF-8, MP3 intactos, fallo parcial y cancelación: OK')
