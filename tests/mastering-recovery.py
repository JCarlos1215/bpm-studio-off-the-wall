"""Real WASM regressions: failed load retry, partial ZIP, mixed failures, delivery formats."""
import array,json,os,subprocess,tempfile,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('BPM_TEST_BASE_URL','http://127.0.0.1:8080').rstrip('/')
with tempfile.TemporaryDirectory() as temp,sync_playwright() as p:
 root=Path(temp)
 for name,duration in [('pendiente.wav',6),('long.wav',60),('last.wav',6)]:
  subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i',f'sine=frequency=440:duration={duration}','-ac','2',str(root/name)],check=True)
 invalid=root/'invalid.wav';invalid.write_bytes(b'Not audio')
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 # Abort the first core fetch. The next attempt must create a fresh working worker.
 attempts={'core':0}
 def core(route):
  attempts['core']+=1
  if attempts['core']==1:route.abort()
  else:route.continue_()
 page.route('**/vendor/core/ffmpeg-core.js',core)
 page.goto(base+'/mastering-studio/',wait_until='load');page.locator('#demo').click()
 page.wait_for_function("document.querySelector('#cancel').hidden",timeout=60000)
 assert 'No se pudo cargar' in page.locator('#status').inner_text()
 assert page.locator('#demo').is_enabled()
 page.locator('#demo').click();page.wait_for_function("!document.querySelector('#process').disabled",timeout=180000)
 assert attempts['core']>=2
 original=page.locator('#original').get_attribute('src')
 def setting(path,value):
  el=page.locator('[data-setting="'+path+'"]')
  if el.evaluate('(e)=>e.tagName')=='SELECT':el.select_option(str(value))
  else:el.evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));}',value)
 def run_master(name,fmt,depth):
  setting('format',fmt);setting('depth',depth);page.locator('#process').click();page.locator('#download').wait_for(state='visible',timeout=180000)
  with page.expect_download() as d:page.locator('#download').click()
  path=root/name;d.value.save_as(path)
  info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_name,bits_per_sample,bits_per_raw_sample','-show_entries','format=duration','-of','json',str(path)]))
  stream=info['streams'][0];assert stream['codec_name']==('flac' if fmt=='flac' else 'pcm_s16le')
  assert int(stream.get('bits_per_raw_sample') or stream['bits_per_sample'])==depth
  assert abs(float(info['format']['duration'])-12)<.05
  return path
 run_master('verified16.wav','wav',16);run_master('verified24.flac','flac',24)
 # A canceled partial batch includes the completed first file despite its name.
 page.locator('#batch-files').set_input_files([str(root/'pendiente.wav'),str(root/'long.wav'),str(root/'last.wav')]);page.locator('#batch-start').click()
 page.wait_for_function("document.querySelectorAll('#batch-list li')[0].dataset.status==='completed' && document.querySelectorAll('#batch-list li')[1].dataset.status==='processing'",timeout=180000)
 page.locator('#cancel').click();page.wait_for_function("document.querySelector('#cancel').hidden",timeout=60000)
 assert page.locator('#batch-list li').nth(0).get_attribute('data-status')=='completed'
 assert page.locator('#batch-list li').nth(1).get_attribute('data-status')=='cancelled'
 assert page.locator('#batch-save').is_visible()
 with page.expect_download() as d:page.locator('#batch-save').click()
 d.value.save_as(root/'partial.zip')
 with zipfile.ZipFile(root/'partial.zip') as z:
  assert z.testzip() is None;report=json.loads(z.read('informe.json'))
  assert report['summary']=={'completed':1,'failed':0,'cancelled':2}
  assert [t['status'] for t in report['tracks']]==['completed','cancelled','cancelled']
  assert len([n for n in z.namelist() if n.endswith('.flac')])==1
 assert page.locator('#original').get_attribute('src')==original and page.locator('#process').is_enabled()
 # Starting a replacement batch must immediately remove the previous archive link.
 page.locator('#batch-start').click();assert page.locator('#batch-save').is_hidden()
 page.locator('#cancel').click();page.wait_for_function("document.querySelector('#cancel').hidden",timeout=60000)
 assert page.locator('#batch-save').is_hidden()
 # An invalid track does not prevent processing the next valid track.
 page.locator('#batch-files').set_input_files([str(invalid),str(root/'last.wav')]);page.locator('#batch-start').click()
 page.wait_for_function("document.querySelector('#cancel').hidden",timeout=180000)
 with page.expect_download() as d:page.locator('#batch-save').click()
 d.value.save_as(root/'mixed.zip')
 with zipfile.ZipFile(root/'mixed.zip') as z:
  assert z.testzip() is None;report=json.loads(z.read('informe.json'))
  assert report['summary']=={'completed':1,'failed':1,'cancelled':0}
 assert page.locator('#process').is_enabled() and page.locator('#original').get_attribute('src')==original
 # The single-track editor still works after failed/canceled batch workers.
 page.locator('#process').click();page.locator('#download').wait_for(state='visible',timeout=180000)
 assert not errors,errors
 b.close();print('Recovery: core-load retry, WAV16/FLAC24, partial ZIP + full cancellation report, stale ZIP cleared, editor preserved and mixed-error batch: OK')
