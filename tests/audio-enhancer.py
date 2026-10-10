import math,struct,wave
from pathlib import Path
from playwright.sync_api import sync_playwright
import tempfile
import os
test_directory=tempfile.TemporaryDirectory(prefix='bpm-enhancer-')
fixture=Path(test_directory.name)/'mastering-fixture.wav'
base_url=os.environ.get('BPM_TEST_BASE_URL','http://127.0.0.1:8080').rstrip('/')
output=Path(test_directory.name)/'output.wav'
rate=44100
with wave.open(str(fixture),'wb') as w:
 w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate)
 frames=bytearray()
 for i in range(rate*16):
  t=i/rate;level=.8 if t%4<2 else .4
  x=level*(math.sin(2*math.pi*440*t)+.55*math.sin(2*math.pi*80*t))+.03
  left=max(-1,min(1,x));right=max(-1,min(1,x*.92))
  frames.extend(struct.pack('<hh',int(left*32767),int(right*32767)))
 w.writeframes(frames)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base_url+'/',wait_until='domcontentloaded')
 page.get_by_role('button',name='Preparador de audio',exact=True).click()
 frame=page.frame_locator('#enhancerFrame')
 frame.locator('#file').wait_for()
 page.locator('#enhancerFrame').element_handle().content_frame().wait_for_load_state('load')
 frame.locator('#file').set_input_files(str(fixture))
 frame.locator('#original-wave').wait_for(state='visible',timeout=60000)
 original_seek=frame.locator('#original-wave .wave-seek')
 original_seek.click(position={'x':original_seek.bounding_box()['width']/2,'y':40})
 assert abs(frame.locator('#original').evaluate('(a)=>a.currentTime')-8)<.2
 original_seek.press('ArrowRight')
 assert abs(frame.locator('#original').evaluate('(a)=>a.currentTime')-13)<.2
 original_seek.press('Home')
 frame.get_by_role('button',name='Analizar y preparar audio',exact=True).click()
 frame.locator('#status.success').wait_for(timeout=180000)
 results={name:frame.locator('#'+name).inner_text() for name in ['before-loudness','after-loudness','before-peak','after-peak','before-range','after-range','result-note']}
 print(results,flush=True)
 assert abs(float(results['after-loudness'].split()[0])+16)<=1
 assert float(results['after-peak'].split()[0])<=-1+.05
 frame.locator('#processed-wave').wait_for(state='visible')
 page.wait_for_timeout(100) # Allow the ResizeObserver to draw the newly visible result.
 coverage='''(canvas,color)=>{
  const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>200&&Math.abs(pixels[i]-color[0])<3&&Math.abs(pixels[i+1]-color[1])<3&&Math.abs(pixels[i+2]-color[2])<3)count++;
  return count/(canvas.width*canvas.height);
 }'''
 original_coverage=frame.locator('#original-wave canvas').evaluate(coverage,[101,182,255])
 output_coverage=frame.locator('#processed-wave canvas').evaluate(coverage,[168,224,195])
 assert original_coverage>.2,original_coverage
 assert .01<output_coverage<original_coverage*.7,(original_coverage,output_coverage)
 processed_seek=frame.locator('#processed-wave .wave-seek')
 processed_seek.click(position={'x':processed_seek.bounding_box()['width']/4,'y':40})
 assert abs(frame.locator('#processed').evaluate('(a)=>a.currentTime')-4)<.2
 assert abs(float(processed_seek.get_attribute('aria-valuenow'))-4)<.2
 processed_seek.press('Home')
 with page.expect_download() as download:
  frame.locator('#download').click()
 download.value.save_as(str(output))
 assert output.stat().st_size>100000
 frame.get_by_role('button',name='A · Escuchar original',exact=True).click()
 frame.get_by_role('button',name='B · Escuchar copia',exact=True).click()
 assert frame.locator('#original').evaluate('(a)=>a.paused')
 assert not frame.locator('#processed').evaluate('(a)=>a.paused')
 frame.locator('#processed').evaluate('(a)=>a.pause()')
 # Changing profiles must invalidate stale output and produce its requested level.
 for preset,target in [('dj',-12),('powerful',-10)]:
  frame.locator(f'input[name=preset][value={preset}]').check()
  assert frame.locator('#results').is_hidden()
  assert frame.locator('#download').get_attribute('href') is None
  frame.get_by_role('button',name='Analizar y preparar audio',exact=True).click()
  frame.locator('#status.success').wait_for(timeout=180000)
  assert abs(float(frame.locator('#after-loudness').inner_text().split()[0])-target)<=1
  assert float(frame.locator('#after-peak').inner_text().split()[0])<=-1+.05
 frame.get_by_role('button',name='Analizar y preparar audio',exact=True).click()
 frame.get_by_role('button',name='Cancelar',exact=True).click()
 assert 'cancelado' in frame.locator('#status').inner_text()
 assert frame.locator('#results').is_hidden()
 assert frame.locator('#processed-wave').is_hidden()
 assert frame.locator('#process').is_enabled()
 # An invalid file cannot reuse an earlier download or leave controls stuck.
 frame.locator('#file').set_input_files({'name':'not-audio.txt','mimeType':'text/plain','buffer':b'not an audio file'})
 frame.get_by_role('button',name='Analizar y preparar audio',exact=True).click()
 frame.locator('#status.error').wait_for(timeout=60000)
 assert frame.locator('#results').is_hidden()
 assert frame.locator('#download').get_attribute('href') is None
 assert frame.locator('#process').is_enabled()
 # Silence must not be reported as a valid normalization result.
 silent=Path(test_directory.name)/'silence.wav'
 with wave.open(str(silent),'wb') as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate)
  w.writeframes(bytes(rate*4*2))
 frame.locator('#file').set_input_files(str(silent))
 frame.get_by_role('button',name='Analizar y preparar audio',exact=True).click()
 frame.locator('#status.error').wait_for(timeout=60000)
 assert 'silencio' in frame.locator('#status').inner_text()
 assert frame.locator('#results').is_hidden()
 assert frame.locator('#process').is_enabled()
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert frame.locator('body').evaluate('()=>document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 print('Ondas y escala de amplitud, navegación por clic/teclado, perfiles, descarga, comparación A/B, cancelación, errores y vista móvil: OK',flush=True)
 b.close()
test_directory.cleanup()
