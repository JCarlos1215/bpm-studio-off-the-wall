import os,tempfile,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('BPM_TEST_BASE_URL','http://127.0.0.1:8080').rstrip('/')
with sync_playwright() as p,tempfile.TemporaryDirectory() as temp:
 artifacts=Path(os.environ.get('BPM_TEST_ARTIFACT_DIR',temp));artifacts.mkdir(parents=True,exist_ok=True)
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
 errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:requests.append((r.method,r.url)) if r.url.startswith('https://alokhamil.my.id/api/') else None)
 page.goto(base+'/',wait_until='domcontentloaded')
 page.get_by_role('button',name='Spotify Utils',exact=True).click()
 frame=page.frame_locator('#spotifyFrame')
 frame.locator('#query').fill('Carefree Kevin MacLeod')
 frame.get_by_role('button',name='Buscar',exact=True).click()
 frame.locator('.track').first.wait_for(timeout=70000)
 print('Búsqueda en vivo:',frame.locator('.track-title').first.inner_text(),flush=True)
 frame.locator('.track').first.get_by_role('button',name='Escuchar Carefree de Kevin MacLeod',exact=True).click()
 audio=frame.locator('#audio')
 for _ in range(80):
  if audio.evaluate('(a)=>!a.paused&&a.readyState>=2'):break
  page.wait_for_timeout(1000)
 assert audio.evaluate('(a)=>!a.paused&&a.readyState>=2'),frame.locator('#player-status').inner_text()
 print('Audio en vivo:',audio.evaluate('(a)=>({duration:a.duration,src:a.currentSrc})'),flush=True)
 audio.evaluate('(a)=>a.pause()')
 frame.locator('.track').first.get_by_role('button',name='Preparar MP3 de Carefree de Kevin MacLeod',exact=True).click()
 frame.locator('#save').wait_for(state='visible',timeout=180000)
 with page.expect_download() as event:frame.locator('#save').click()
 output=Path(temp)/'carefree.mp3';event.value.save_as(str(output))
 assert output.stat().st_size>100000
 result=subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(output)],text=True)
 assert float(result)>100
 print('Descarga en vivo:',output.stat().st_size,'bytes;',result.strip(),'segundos',flush=True)
 page.screenshot(path=str(artifacts/'spotify-utils-desktop.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert frame.locator('body').evaluate('()=>document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(artifacts/'spotify-utils-movil.png'),full_page=True)
 page.get_by_role('button',name='Preparador de audio',exact=True).click()
 assert audio.evaluate('(a)=>a.paused')
 assert not errors,errors
 assert any(method=='POST' and '/api/download' in url for method,url in requests)
 assert not any(method=='OPTIONS' for method,url in requests)
 print('API/proxy correctos, POST sin preflight, reproducción, guardado y vista móvil: OK',flush=True)
 b.close()
