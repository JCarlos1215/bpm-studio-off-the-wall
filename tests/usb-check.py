import json,os,subprocess,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('BPM_TEST_BASE_URL','http://127.0.0.1:8080').rstrip('/')
with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
 root=Path(folder);usb=root/'TEST_USB';(usb/'Music').mkdir(parents=True);(usb/'PIONEER/rekordbox').mkdir(parents=True);(usb/'PIONEER/USBANLZ/A').mkdir(parents=True)
 (usb/'PIONEER/rekordbox/export.pdb').write_bytes(b'library test fixture, not a valid database');(usb/'PIONEER/rekordbox/exportLibrary.db').write_bytes(b'plus fixture');(usb/'PIONEER/USBANLZ/A/ANLZ0000.DAT').write_bytes(b'analysis fixture');(usb/'Music/empty.mp3').write_bytes(b'')
 subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','pcm_s16le',str(usb/'Music/PCM.wav')],check=True)
 subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','pcm_f32le',str(usb/'Music/Float.wav')],check=True)
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/',wait_until='domcontentloaded');assert page.locator('#usbCheckFrame').get_attribute('src')=='about:blank'
 page.get_by_role('button',name='USB Check',exact=True).click();f=page.frame_locator('#usbCheckFrame');expect(f.locator('#demo')).to_be_enabled()
 f.locator('#folder').set_input_files(str(usb));page.wait_for_function("document.querySelector('#usbCheckFrame').contentDocument.querySelector('#status').textContent.includes('terminada')")
 assert f.locator('#file-count').inner_text()=='6';assert f.locator('#score').inner_text()=='—/10';assert f.locator('#demo-badge').is_hidden()
 f.locator('#filesystem').select_option('exFAT');assert f.locator('#score').inner_text()=='8/10';assert 'XDJ-XZ' not in f.locator('#unsupported').inner_text();assert 'CDJ-2000NXS2' in f.locator('#unsupported').inner_text()
 assert 'Detectada' in f.locator('#legacy').inner_text() and 'Detectada' in f.locator('#plus').inner_text()
 assert f.locator('#issue-count').inner_text()=='2'
 f.locator('#capacity').fill('100');f.locator('#free').fill('200');assert 'Revisa' in f.locator('#capacity-error').inner_text();f.locator('#free').fill('25')
 with page.expect_download() as d:f.locator('#export').click()
 path=root/'report.json';d.value.save_as(path);report=json.loads(path.read_text());assert not report['demo'];assert report['providedByUser']['filesystem']=='exFAT';assert report['libraries']['legacy']==1;assert len(report['files'])==6
 f.locator('#only-issues').check();assert f.locator('#file-rows tr').count()==2
 f.locator('#devices-tab').click();assert f.locator('.device-card').count()==10
 f.locator('#device-cards button').nth(2).click();assert f.locator('#gear').input_value()=='nxs2'
 f.locator('#check-tab').click();f.locator('#rescan').click();page.wait_for_function("document.querySelector('#usbCheckFrame').contentDocument.querySelector('#cancel').hidden")
 f.locator('#demo').click();page.wait_for_function("document.querySelector('#usbCheckFrame').contentDocument.querySelector('#cancel').hidden")
 assert f.locator('#demo-badge').is_visible();assert f.locator('.unit').count()==2
 f.locator('#convert').click();assert page.locator('#converterView').is_visible();page.get_by_role('button',name='USB Check',exact=True).click();assert f.locator('#demo-badge').is_visible()
 # Real scanning loop with many metadata-only files exercises cancel/partial report.
 f.locator('#files').evaluate("""input=>{const dt=new DataTransfer();for(let i=0;i<6000;i++)dt.items.add(new File(['x'],'track'+i+'.mp3'));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));}""")
 f.locator('#cancel').click();page.wait_for_function("document.querySelector('#usbCheckFrame').contentDocument.querySelector('#cancel').hidden")
 assert f.locator('#partial').is_visible()
 with page.expect_download() as d:f.locator('#export').click()
 path=root/'partial.json';d.value.save_as(path);partial=json.loads(path.read_text());assert partial['partial'] and partial['cancelled'];assert len(partial['files'])<6000
 page.set_viewport_size({'width':390,'height':844});assert f.locator('body').evaluate('()=>document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 browser.close();print('USB Check browser: folder scan, real WAV headers, filesystem matrix, libraries, manual capacity, report, demo, navigation, cancel and mobile: OK')
