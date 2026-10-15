"""Browser integration with real WASM DSP and native verification of exports."""
import json,os,re,subprocess,tempfile,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('BPM_TEST_BASE_URL','http://127.0.0.1:8080').rstrip('/')
artifacts=Path('/workspace/shared/downloads');artifacts.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as directory,sync_playwright() as p:
 root=Path(directory);fixture=root/'original.wav'
 subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','aevalsrc=0.16*sin(2*PI*220*t)+0.04*sin(2*PI*4000*t)|0.12*sin(2*PI*220*t)+0.03*sin(2*PI*6000*t):s=44100:d=8','-c:a','pcm_s16le',str(fixture)],check=True)
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':1365,'height':1000},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));pending=[]
 page.route('**/mastering-studio/app.js*',lambda r:pending.append(r))
 page.goto(base+'/',wait_until='domcontentloaded');assert page.locator('#masteringFrame').get_attribute('src')=='about:blank'
 page.get_by_role('button',name='Mastering Studio',exact=True).click();f=page.frame_locator('#masteringFrame');f.locator('#demo').wait_for();assert f.locator('#demo').is_disabled();assert f.locator('#file').is_disabled();assert pending;pending[0].continue_();expect(f.locator('#demo')).to_be_enabled(timeout=30000);f.locator('#file').set_input_files(str(fixture))
 f.locator('#process').wait_for(state='visible');page.wait_for_function("!document.querySelector('#masteringFrame').contentDocument.querySelector('#process').disabled",timeout=180000)
 assert 'Original analizado' in f.locator('#status').inner_text()
 before=float(f.locator('#metric-lufs').inner_text());assert before<-10
 def setting(path,value):
  el=f.locator('[data-setting="'+path+'"]')
  if isinstance(value,bool):el.set_checked(value)
  elif el.evaluate('(e)=>e.tagName')=='SELECT':el.select_option(str(value))
  else:el.evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));}',value)
 for k,v in [('multiband',True),('bus',True),('deharsh',True),('drive',3),('character','tape'),('width',0),('eq.1.gain',-2),('format','flac'),('depth',16),('rate',48000),('target',-12)]:setting(k,v)
 f.locator('#process').click();page.wait_for_function("document.querySelector('#masteringFrame').contentDocument.querySelector('#cancel').hidden",timeout=180000)
 assert f.locator('#download').is_visible(),f.locator('#status').inner_text()
 assert float(f.locator('#metric-peak').inner_text())<=-1+.05
 with page.expect_download() as download:f.locator('#download').click()
 mastered=root/'master.flac';download.value.save_as(mastered)
 info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_name,sample_rate,bits_per_raw_sample,channels','-show_entries','format=duration','-of','json',str(mastered)]))
 assert info['streams'][0]['codec_name']=='flac' and info['streams'][0]['sample_rate']=='48000' and info['streams'][0]['bits_per_raw_sample']=='16'
 assert abs(float(info['format']['duration'])-8)<.05
 import array
 samples=array.array('f',subprocess.check_output(['ffmpeg','-v','error','-i',str(mastered),'-f','f32le','-c:a','pcm_f32le','-']))
 assert max(abs(samples[i]-samples[i+1]) for i in range(0,len(samples),2))<1e-7,'Width=0 is not mono'
 with page.expect_download() as report:f.locator('#report').click()
 report.value.save_as(root/'report.json');data=json.loads((root/'report.json').read_text());assert data['settings']['multiband'] and data['before']['loudness']!=data['after']['loudness']
 measured=subprocess.run(['ffmpeg','-hide_banner','-i',str(mastered),'-af','loudnorm=I=-14:TP=-1:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
 verified=json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}',measured.stderr)[-1])
 assert float(verified['input_tp'])<=-.95 and abs(float(verified['input_i'])-data['after']['loudness'])<.3
 f.locator('#listen-b').click();page.wait_for_function("!document.querySelector('#masteringFrame').contentDocument.querySelector('#processed').paused")
 page.wait_for_timeout(300)
 assert f.locator('#metric-correlation').inner_text()!='—'
 page.get_by_role('button',name='Analizador BPM',exact=True).click()
 assert f.locator('#processed').evaluate('(audio)=>audio.paused')
 page.get_by_role('button',name='Mastering Studio',exact=True).click()
 with page.expect_download() as session:f.locator('#export-session').click()
 session.value.save_as(root/'session.json');saved=json.loads((root/'session.json').read_text());assert saved['settings']['width']==0
 f.locator('#reset').click();assert f.locator('#download').is_hidden()
 f.locator('#import-session').set_input_files(str(root/'session.json'));assert f.locator('[data-setting="width"]').input_value()=='0'
 f.locator('#reference-file').set_input_files(str(mastered));page.wait_for_function("!document.querySelector('#masteringFrame').contentDocument.querySelector('#reference-target').disabled",timeout=180000)
 assert 'LUFS' in f.locator('#reference-info').inner_text()
 f.locator('#reference-target').click();assert float(f.locator('[data-setting="target"]').input_value())<=-8
 # Cancellation returns to an operable engine, then a real two-file batch ZIP.
 f.locator('#process').click();f.locator('#cancel').click();page.wait_for_function("document.querySelector('#masteringFrame').contentDocument.querySelector('#cancel').hidden",timeout=30000)
 assert not f.locator('#process').is_disabled()
 f.locator('#batch-files').set_input_files([str(fixture),str(fixture)]);f.locator('#batch-start').click()
 page.wait_for_function("document.querySelector('#masteringFrame').contentDocument.querySelector('#cancel').hidden",timeout=180000)
 assert f.locator('#batch-save').is_visible(),f.locator('#status').inner_text()
 with page.expect_download() as archive:f.locator('#batch-save').click()
 archive.value.save_as(root/'batch.zip')
 with zipfile.ZipFile(root/'batch.zip') as z:
  assert z.testzip() is None;names=z.namelist();assert len([n for n in names if n.endswith('.flac')])==2;assert len(json.loads(z.read('informe.json'))['tracks'])==2
 # Mobile layout, history retained and navigation switching.
 page.set_viewport_size({'width':390,'height':844});assert f.locator('body').evaluate('()=>document.documentElement.scrollWidth<=innerWidth')
 page.get_by_role('button',name='Analizador BPM',exact=True).click();page.get_by_role('button',name='Mastering Studio',exact=True).click()
 assert f.locator('#batch-save').is_visible()
 page.screenshot(path=str(artifacts/'mastering-studio-mobile.png'),full_page=True)
 page.set_viewport_size({'width':1440,'height':1000});page.screenshot(path=str(artifacts/'mastering-studio-desktop.png'),full_page=True)
 f.locator('#eq-only').click();assert f.locator('[data-setting=width]').input_value()=='1';assert not f.locator('[data-setting=normalize]').is_checked();assert not f.locator('[data-setting=bus]').is_checked()
 assert not errors,errors
 browser.close();print('Mastering: real multiband/de-harsh/drive/mono FLAC16 48k, peaks, A/B data, reference, JSON sessions, cancellation, two-file ZIP and mobile: OK')
