import { analyzeAudioBuffer, formatTime } from './analysis.js';
import { selectCamelot } from './camelot.js';

if (new URLSearchParams(window.location.search).has('embed')) {
  document.documentElement.classList.add('embedded');
}

const fileInput = document.querySelector('#audio-file');
const fileLabel = document.querySelector('#file-label');
const audioPlayer = document.querySelector('#audio-player');
const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const cueList = document.querySelector('#cue-list');
const exportButton = document.querySelector('#export-cues');
let objectUrl = null;
let currentCues = [];
let runId = 0;

function setStatus(message, state = '') {
  status.textContent = message;
  status.className = `status ${state}`.trim();
}

function renderCues(cues) {
  currentCues = cues;
  cueList.replaceChildren();
  if (!cues.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-cues';
    empty.textContent = 'No se encontraron puntos de cue fiables para esta pista.';
    cueList.append(empty);
    exportButton.disabled = true;
    return;
  }

  for (const cue of cues) {
    const item = document.createElement('li');
    item.className = 'cue';
    item.innerHTML = '<span class="cue-tag"></span><div><strong></strong><p></p></div><time></time>';
    item.querySelector('.cue-tag').textContent = cue.label;
    item.querySelector('.cue-tag').style.setProperty('--cue-color', cue.color);
    item.querySelector('strong').textContent = cue.title;
    item.querySelector('p').textContent = cue.detail;
    item.querySelector('time').textContent = formatTime(cue.time);
    cueList.append(item);
  }
  exportButton.disabled = false;
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  const id = ++runId;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  audioPlayer.pause();
  audioPlayer.removeAttribute('src');
  audioPlayer.load();
  audioPlayer.hidden = true;
  fileLabel.textContent = file.name;
  progress.hidden = true;
  document.querySelector('#key-result').textContent = '—';
  document.querySelector('#camelot-result').textContent = 'Camelot —';
  selectCamelot(null);
  document.querySelector('#bpm-result').textContent = '—';
  document.querySelector('#bpm-detail').textContent = 'Análisis automático';
  document.querySelector('#energy-result').textContent = '—';
  document.querySelector('#energy-detail').textContent = 'Nivel RMS normalizado';
  renderCues([]);
  if (file.size > 150 * 1024 * 1024) {
    setStatus('El archivo supera el límite local de 150 MB. Selecciona un archivo más pequeño.', 'error');
    fileLabel.textContent = 'Selecciona un archivo de audio';
    fileInput.value = '';
    return;
  }
  objectUrl = URL.createObjectURL(file);
  audioPlayer.src = objectUrl;
  audioPlayer.hidden = false;
  fileLabel.textContent = file.name;
  progress.hidden = false;
  progress.value = 0;
  exportButton.disabled = true;
  renderCues([]);
  setStatus('Leyendo el archivo de audio localmente…');

  let audioContext;
  try {
    audioContext = new AudioContext();
    const audioData = await file.arrayBuffer();
    if (id !== runId) return;
    setStatus('Calculando tonalidad, tempo, energía y secciones…');
    let buffer;
    try {
      buffer = await audioContext.decodeAudioData(audioData);
    } catch {
      throw new Error('este navegador no puede leer el audio del archivo. Prueba con un MP3, WAV o M4A sin protección. En iPhone, guarda primero el archivo en la app Archivos.');
    }
    if (id !== runId) return;
    if (buffer.duration > 20 * 60) {
      throw new Error('la duración supera el límite local de 20 minutos.');
    }
    const result = analyzeAudioBuffer(buffer, value => {
      if (id === runId) progress.value = value;
    });
    if (id !== runId) return;

    document.querySelector('#key-result').textContent = result.key ? `${result.key} ${result.mode}` : 'No concluyente';
    document.querySelector('#camelot-result').textContent = result.camelot ? `Camelot ${result.camelot}` : 'Sin tonalidad fiable';
    selectCamelot(result.camelot);
    document.querySelector('#bpm-result').textContent = result.bpm === null ? '—' : String(result.bpm);
    document.querySelector('#bpm-detail').textContent = `Estimación · ${result.bpmConfidence}`;
    document.querySelector('#energy-result').textContent = String(result.energy);
    document.querySelector('#energy-detail').textContent = 'Nivel RMS normalizado · no mide energía musical';
    renderCues(result.cues);
    progress.value = 100;
    setStatus(`Análisis terminado · ${formatTime(buffer.duration)} · procesado en este dispositivo.`, 'success');
  } catch (error) {
    if (id !== runId) return;
    renderCues([]);
    setStatus(error instanceof Error ? `No se pudo analizar el archivo: ${error.message}` : 'No se pudo analizar el archivo de audio.', 'error');
  } finally {
    await audioContext?.close();
    if (id === runId) progress.hidden = true;
  }
});

exportButton.addEventListener('click', () => {
  if (!currentCues.length) return;
  const rows = [['Hot Cue', 'Punto sugerido', 'Tiempo (segundos)', 'Tiempo', 'Motivo']];
  for (const cue of currentCues) {
    rows.push([cue.label, cue.title, cue.time.toFixed(2), formatTime(cue.time), cue.detail]);
  }
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const download = document.createElement('a');
  download.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  download.download = 'hot-cues-sugeridos.csv';
  download.click();
  URL.revokeObjectURL(download.href);
});

window.addEventListener('pagehide', () => {
  runId += 1;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

if (new URLSearchParams(location.search).has('embed') && window.parent !== window) {
  const sendHeight = () => window.parent.postMessage(
    { type: 'key-analyzer-resize', height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) },
    location.origin,
  );
  new ResizeObserver(sendHeight).observe(document.documentElement);
  window.addEventListener('load', sendHeight);
}
