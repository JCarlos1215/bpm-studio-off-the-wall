"""Verify real browser exports against independent frequency and duration measurements."""
import math,os,struct,subprocess,tempfile,wave
from pathlib import Path
import numpy as np
from playwright.sync_api import sync_playwright
base=os.environ.get('BPM_TEST_BASE_URL','http://127.0.0.1:8080').rstrip('/')
with tempfile.TemporaryDirectory(prefix='bpm-pitch-') as directory:
 source=Path(directory)/'chord-plus-24-cents.wav'
 rate=44100;duration=12;detuning=24
 with wave.open(str(source),'wb') as w:
  w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate)
  samples=bytearray()
  for i in range(rate*duration):
   t=i/rate;r=2**(detuning/1200)
   x=.3*math.sin(2*math.pi*440*r*t)+.15*math.sin(2*math.pi*329.6275569*r*t)+.1*math.sin(2*math.pi*659.2551138*r*t)
   samples.extend(struct.pack('<hh',int(x*32767),int(x*.9*32767)))
  w.writeframes(samples)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base+'/audio-enhancer/?embed=1',wait_until='load')
  page.locator('#file').set_input_files(str(source))
  for mode,behavior,manual,expected_cents in [('auto','preserve',0,0),('auto','speed',0,0),('manual','preserve',-12,12),('off','preserve',0,24)]:
   page.locator('#pitch-mode').select_option(mode)
   if mode!='off':page.locator('#pitch-behavior').select_option(behavior)
   if mode=='manual':page.locator('#pitch-cents').fill(str(manual))
   assert page.locator('#results').is_hidden()
   page.get_by_role('button',name='Analizar y preparar audio',exact=True).click()
   page.locator('#status.success').wait_for(timeout=180000)
   assert float(page.locator('#after-peak').inner_text().split()[0])<=-.95
   assert abs(float(page.locator('#after-loudness').inner_text().split()[0])+16)<1
   if mode=='off':assert page.locator('#pitch-result').is_hidden()
   else:
    assert '24.0 cents' in page.locator('#pitch-before').inner_text()
    assert ('-24.0 cents' if mode=='auto' else '-12.0 cents') in page.locator('#pitch-applied').inner_text()
    assert ('0.0 cents' if mode=='auto' else '12.0 cents') in page.locator('#pitch-after').inner_text()
   output=Path(directory)/f'{mode}-{behavior}.wav'
   with page.expect_download() as download:page.locator('#download').click()
   download.value.save_as(str(output))
   with wave.open(str(output),'rb') as w:actual_duration=w.getnframes()/w.getframerate()
   decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(output),'-ac','1','-ar','44100','-f','f32le','-'])
   values=np.frombuffer(decoded,dtype='<f4')[rate:rate+262144]
   spectrum=np.abs(np.fft.rfft(values*np.hanning(len(values))))
   frequencies=np.fft.rfftfreq(len(values),1/rate)
   bins=np.flatnonzero((frequencies>420)&(frequencies<460))
   k=bins[np.argmax(spectrum[bins])]
   l,c,r=np.log(spectrum[k-1:k+2]);delta=.5*(l-r)/(l-2*c+r)
   measured_hz=(k+delta)*rate/len(values)
   measured_cents=1200*math.log2(measured_hz/440)
   assert abs(measured_cents-expected_cents)<1,(mode,behavior,measured_cents)
   expected_duration=duration/2**(-24/1200) if behavior=='speed' else duration
   assert abs(actual_duration-expected_duration)<.06,(actual_duration,expected_duration)
   print(f'{mode}/{behavior}: {measured_hz:.3f} Hz ({measured_cents:+.2f} cents), {actual_duration:.3f} s',flush=True)
  # Inconsistent tuning must be reported explicitly and never corrected blindly.
  ambiguous=Path(directory)/'variable-tuning.wav'
  with wave.open(str(ambiguous),'wb') as w:
   w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate)
   frames=bytearray(samples[:rate*6*4])
   for i in range(rate*6):
    t=i/rate;r=2**(-24/1200)
    x=.3*math.sin(2*math.pi*440*r*t)+.15*math.sin(2*math.pi*329.6275569*r*t)+.1*math.sin(2*math.pi*659.2551138*r*t)
    frames.extend(struct.pack('<hh',int(x*32767),int(x*.9*32767)))
   w.writeframes(frames)
  page.locator('#file').set_input_files(str(ambiguous))
  page.locator('#pitch-mode').select_option('auto')
  page.locator('#process').click()
  page.locator('#status.success').wait_for(timeout=180000)
  assert 'no concluyente' in page.locator('#pitch-before').inner_text()
  assert '0.0 cents' in page.locator('#pitch-applied').inner_text()
  assert 'conservó la afinación' in page.locator('#pitch-applied').inner_text()
  page.locator('#pitch-mode').select_option('manual')
  page.locator('#pitch-cents').fill('101')
  page.locator('#process').click()
  page.locator('#status.error').wait_for()
  assert page.locator('#process').is_enabled()
  assert page.locator('#results').is_hidden()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors
  browser.close()
 print('Frecuencia y duración exportadas, modos automático/manual/desactivado y límites: OK',flush=True)
