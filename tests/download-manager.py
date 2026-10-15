import os
from playwright.sync_api import sync_playwright
base=os.environ.get('BPM_TEST_BASE_URL','http://127.0.0.1:8080').rstrip('/')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/',wait_until='domcontentloaded')
 assert page.locator('#spotifyFrame').count()==0
 page.get_by_role('button',name='Download Manager',exact=True).click()
 frame=page.frame_locator('#mp3Frame');frame.locator('#prepare-zip').wait_for()
 assert '/spotify-utils/' in page.locator('#mp3Frame').get_attribute('src')
 assert page.locator('#showMp3').get_attribute('aria-pressed')=='true'
 frame.locator('#playlist-input').evaluate('(el)=>el.closest("details").open=true')
 frame.locator('#playlist-input').fill('Song - Artist');frame.locator('#import-list').click()
 assert frame.locator('#queue li').count()==1
 page.get_by_role('button',name='Analizador BPM',exact=True).click()
 assert page.locator('#mp3View').is_hidden()
 page.get_by_role('button',name='Download Manager',exact=True).click()
 assert frame.locator('#queue li').count()==1
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert frame.locator('body').evaluate('()=>document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 browser.close();print('Download Manager carga Spotify Utils con playlist ZIP, conserva la lista y funciona en móvil: OK')
