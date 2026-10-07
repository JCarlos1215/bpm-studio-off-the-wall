'use strict';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const embedded = new URLSearchParams(location.search).has('embed');
if (embedded) document.documentElement.classList.add('embedded');
const terminal = new Set(['completed', 'partial', 'failed', 'cancelled']);
const names = { queued:'En cola', resolving:'Leyendo enlace', processing:'En curso', searching:'Buscando audio', downloading:'Descargando', converting:'Convirtiendo', tagging:'Añadiendo etiquetas', completed:'Completada', partial:'Con errores', failed:'Error', cancelled:'Cancelada' };
let jobs = [], mode = 'link', view = 'convert', filter = 'all', results = [], pendingDelete = null, lastData = '', toastTimer;
const passwordStorageKey = 'alltomp3-server-password';
let serverPassword = '';
let usingRememberedPassword = false;
try {
  serverPassword = localStorage.getItem(passwordStorageKey) || '';
  usingRememberedPassword = Boolean(serverPassword);
} catch {}
let preferences = { tags:true, lyrics:true, bitrate:256 };
try { preferences = { ...preferences, ...JSON.parse(localStorage.getItem('alltomp3-preferences') || '{}') }; } catch {}
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const icon = (name) => `<svg aria-hidden="true"><use href="/static/icons.svg#${name}"/></svg>`;
const duration = (seconds) => seconds ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}` : '—';
const date = (value) => new Date(value * 1000).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
function artwork(track) {
  let safe = false;
  try { safe = new URL(track.cover).protocol === 'https:'; } catch {}
  return safe ? `<img class="cover" src="${escapeHTML(track.cover)}" alt="Portada de ${escapeHTML(track.title)}" loading="lazy">` : `<span class="cover cover-placeholder">${icon('music')}</span>`;
}
function empty(title, description) { return `<div class="empty-state">${icon('music')}<div><b>${title}</b><p>${description}</p></div></div>`; }
async function api(path, options = {}) {
  const headers = { 'Content-Type':'application/json', 'X-Requested-With':'AllToMP3', ...(options.headers || {}) };
  if (serverPassword) headers.Authorization = `Basic ${btoa(`bpmstudio:${serverPassword}`)}`;
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    const login = $('#server-login-dialog');
    if (usingRememberedPassword) {
      usingRememberedPassword = false;
      serverPassword = '';
      try { localStorage.removeItem(passwordStorageKey); } catch {}
      $('#server-login-error').textContent = 'La contraseña guardada ya no es válida. Introduce la contraseña actual.';
      $('#server-login-error').hidden = false;
    }
    if (!login.open) login.showModal();
    const error = new Error('La contraseña no es correcta.');
    error.status = response.status;
    throw error;
  }
  let data;
  try { data = await response.json(); } catch {
    const error = new Error(response.status >= 500 ? 'El servidor se está iniciando. Inténtalo de nuevo en un minuto.' : 'El servidor no devolvió una respuesta válida.');
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo completar la operación.');
    error.status = response.status;
    throw error;
  }
  return data;
}
$('#server-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('#server-password').value;
  $('#server-login-submit').disabled = true;
  $('#server-login-error').hidden = true;
  serverPassword = password;
  usingRememberedPassword = false;
  try {
    const data = await api('/api/jobs');
    if ($('#remember-server-password').checked) {
      try {
        localStorage.setItem(passwordStorageKey, password);
        usingRememberedPassword = true;
      } catch {
        toast('Conectado, pero el navegador no pudo recordar la contraseña.', true);
      }
    } else {
      try { localStorage.removeItem(passwordStorageKey); } catch {
        toast('Conectado, pero el navegador no pudo borrar la contraseña guardada.', true);
      }
    }
    jobs = data.jobs;
    lastData = JSON.stringify(jobs);
    render();
    $('#server-status').className = 'server-status online';
    $('#server-status').innerHTML = '<span></span>Servidor conectado';
    $('#server-password').value = '';
    $('#server-login-dialog').close();
    api('/api/status').then(status => {
      $('#spotify-info').textContent = status.spotify_configured ? `Spotify configurado. Límite de ${status.playlist_limit} canciones por lista.` : `YouTube, SoundCloud y Deezer disponibles. Spotify necesita credenciales en el servidor. Límite de ${status.playlist_limit} canciones por lista.`;
    });
  } catch (error) {
    if (error.message === 'La contraseña no es correcta.') {
      $('#server-login-error').textContent = error.message;
      $('#server-login-error').hidden = false;
    } else {
      $('#server-login-error').textContent = 'No se pudo conectar con el servidor. Inténtalo de nuevo.';
      $('#server-login-error').hidden = false;
    }
  } finally {
    $('#server-login-submit').disabled = false;
  }
});
function toast(message, error = false) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.toggle('toast-error', error); $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 7000 : 4000);
}
function savePreferences() {
  preferences = { tags:$('#tags-option').checked, lyrics:$('#lyrics-option').checked, bitrate:Number($('#bitrate').value) };
  try { localStorage.setItem('alltomp3-preferences', JSON.stringify(preferences)); } catch {}
  $('#tags-label').textContent = preferences.tags ? 'activadas' : 'desactivadas';
  $('#lyrics-label').textContent = preferences.tags && preferences.lyrics ? 'activadas' : 'desactivadas';
  $('#lyrics-option').disabled = !preferences.tags;
}
function setView(next) {
  view = next;
  for (const item of ['convert','library','history']) $(`#${item}-view`).hidden = item !== next;
  $$('[data-view]').forEach(button => { button.classList.toggle('active', button.dataset.view === next); button.setAttribute('aria-pressed', String(button.dataset.view === next)); });
  $('#breadcrumb').innerHTML = `Off The Wall <span>/</span> <strong>${{convert:'Descargas', library:'Mi biblioteca', history:'Historial'}[next]}</strong>`;
  render(); window.scrollTo({top:0, behavior:'smooth'});
}
function setMode(next) {
  closePreview();
  mode = next;
  $$('[data-mode]').forEach(button => { button.classList.toggle('selected',button.dataset.mode === next); button.setAttribute('aria-selected',String(button.dataset.mode === next)); });
  $('#query-label').textContent = {link:'PEGA EL ENLACE DE TU CANCIÓN',search:'BUSCA POR ARTISTA O NOMBRE DE CANCIÓN',playlist:'PEGA EL ENLACE DE TU LISTA O ÁLBUM'}[next];
  $('#query').placeholder = {link:'Enlace de YouTube, SoundCloud, Spotify o Deezer',search:'Artista — nombre de la canción',playlist:'Enlace de una playlist o álbum público'}[next];
  $('#query').value = ''; $('#form-error').hidden = true;
  $('#submit-button').innerHTML = `${next === 'search' ? 'Buscar canción' : 'Convertir a MP3'}${icon(next === 'search' ? 'search' : 'arrow')}`;
  $('#search-section').hidden = true; $('#search-provider-row').hidden = next !== 'search'; $('#query').focus();
}
function trackRow(track, job, index, library = false) {
  const ready = track.status === 'completed';
  const status = ready ? `${duration(track.duration)} · ${job.options.bitrate} kbps` : names[track.status] || track.status;
  return `<div class="track-row ${library ? 'library-track' : ''}">${artwork(track)}<div class="track-info"><b>${escapeHTML(track.title)}</b><small>${escapeHTML(track.artist || 'Artista sin identificar')}${library && track.album ? ' · ' + escapeHTML(track.album) : ''}</small></div><div class="track-status ${track.status === 'failed' ? 'error' : ''}">${track.status === 'failed' ? escapeHTML(track.error) : escapeHTML(status)}${!terminal.has(track.status) ? `<div class="progress"><div class="progress-fill" data-progress="${Math.max(0,Math.min(100,track.progress || 0))}"></div></div>` : ''}</div><div class="track-buttons"><button class="track-detail-button" data-action="detail" data-job="${job.id}" data-index="${index}">Detalles</button>${ready ? `<a class="secondary" href="/api/jobs/${job.id}/tracks/${index}/download" aria-label="Descargar ${escapeHTML(track.title)}">${icon('download')}<span>MP3</span></a>` : ''}</div></div>`;
}
function jobCard(job) {
  const done = job.tracks.filter(t => t.status === 'completed').length;
  const active = !terminal.has(job.status);
  const tracks = job.tracks.slice(0,5).map((track,index) => trackRow(track,job,index)).join('');
  const more = job.tracks.length > 5 ? `<details class="job-more"><summary>Ver ${job.tracks.length - 5} canciones más</summary>${job.tracks.slice(5).map((track,index) => trackRow(track,job,index + 5)).join('')}</details>` : '';
  return `<article class="job-card"><div class="job-head"><div class="job-title"><strong>${escapeHTML(job.title)}</strong><span class="job-meta">${date(job.created_at)} · MP3 ${job.options.bitrate} kbps${job.tracks.length ? ` · ${done}/${job.tracks.length} listas` : ''}</span></div><div class="job-actions"><span class="badge ${job.status}">${active ? '<span class="spinner"></span>' : ''}${names[job.status] || escapeHTML(job.status)}</span>${!active && done ? `<a class="secondary" href="/api/jobs/${job.id}/archive">${icon('download')} ZIP</a>` : ''}${active ? `<button class="text-button" data-action="cancel" data-job="${job.id}">Cancelar</button>` : `<button class="text-button" data-action="retry" data-job="${job.id}">Reintentar</button><button class="icon-button" data-action="delete" data-job="${job.id}" aria-label="Eliminar conversión">×</button>`}</div></div>${job.error ? `<p class="job-error">${escapeHTML(job.error)}</p>` : ''}${tracks}${more}</article>`;
}
function render() {
  const completed = jobs.flatMap(job => job.tracks.map((track,index) => ({track,job,index}))).filter(({track}) => track.status === 'completed');
  $('#library-count').textContent = completed.length;
  $('#stat-total').textContent = jobs.length;
  $('#stat-active').textContent = jobs.filter(job => !terminal.has(job.status)).length;
  $('#stat-ready').textContent = completed.length;
  $('#stat-errors').textContent = jobs.filter(job => ['failed', 'partial'].includes(job.status)).length;
  if (view === 'convert') {
    const recent = jobs.filter(job => !terminal.has(job.status));
    const display = recent.length ? recent : jobs.slice(0,2);
    $('#queue-count').textContent = recent.length;
    $('#queue').innerHTML = display.length ? display.map(jobCard).join('') : empty('Tu próxima canción empieza aquí','Pega un enlace o busca una canción. Nosotros hacemos el resto.');
  }
  if (view === 'library') {
    const term = $('#library-filter').value.toLowerCase();
    const visible = completed.filter(({track}) => `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(term));
    $('#library-summary').textContent = `${visible.length} ${visible.length === 1 ? 'canción' : 'canciones'}`;
    $('#library').innerHTML = visible.length ? visible.map(({track,job,index}) => trackRow(track,job,index,true)).join('') : empty(term ? 'No hay coincidencias' : 'Tu colección empieza con una canción',term ? 'Prueba otro nombre de canción, artista o álbum.' : 'Tus MP3 aparecerán aquí cuando terminen de convertirse.');
  }
  if (view === 'history') {
    const visible = jobs.filter(job => filter === 'all' || (filter === 'active' ? !terminal.has(job.status) : filter === 'failed' ? ['failed','partial','cancelled'].includes(job.status) : job.status === filter));
    $('#history').innerHTML = visible.length ? visible.map(jobCard).join('') : empty('Todavía no hay conversiones aquí','Las conversiones aparecerán en este historial.');
  }
  $$('.progress-fill').forEach(element => { element.style.width = `${element.dataset.progress}%`; });
}
async function refresh() {
  try {
    const data = await api('/api/jobs'); jobs = data.jobs;
    const serialized = JSON.stringify(jobs);
    if (serialized !== lastData) { lastData = serialized; render(); }
    $('#server-status').className = 'server-status online'; $('#server-status').innerHTML = '<span></span>Servidor conectado';
  } catch (error) {
    $('#server-status').className = 'server-status offline';
    $('#server-status').innerHTML = [502,503,504].includes(error.status) ? '<span></span>Servidor despertando; espera un minuto' : '<span></span>Servidor desconectado';
  }
}
async function createJob(query, playlist = false) {
  await api('/api/jobs', { method:'POST', body:JSON.stringify({query,options:{...preferences,playlist}}) });
  toast('Conversión añadida a la cola.'); await refresh();
}
$('#convert-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const query = $('#query').value.trim(); if (!query) return;
  $('#form-error').hidden = true; $('#submit-button').disabled = true;
  const label = $('#submit-button').innerHTML; $('#submit-button').textContent = mode === 'search' ? 'Buscando…' : 'Añadiendo…';
  try {
    savePreferences();
    if (mode === 'search') {
      closePreview();
      const data = await api('/api/search', {method:'POST', body:JSON.stringify({query, source:$('#search-provider').value})}); results = data.tracks;
      $('#search-results').innerHTML = results.length ? results.map((track,index) => `<div class="track-row search-row" data-search-row="${index}">${artwork(track)}<div class="track-info"><b>${escapeHTML(track.title)}</b><small>${escapeHTML(track.artist)} · ${duration(track.duration)} · ${escapeHTML(track.source)}</small></div><div class="track-buttons">${track.preview_url ? `<button class="secondary" data-preview="${index}" aria-label="Vista previa de ${escapeHTML(track.title)}" aria-expanded="false" aria-controls="inline-preview-${index}">▶ Vista previa</button>` : ''}<button class="secondary" data-result="${index}">${icon('convert')} Convertir</button></div><div class="inline-preview" id="inline-preview-${index}" hidden></div></div>`).join('') : empty('No encontramos esta canción','Prueba una búsqueda con el nombre del artista y de la canción.');
      $('#search-count').textContent = `${results.length} resultados`; $('#search-section').hidden = false;
    } else { await createJob(query,mode === 'playlist'); $('#query').value = ''; }
  } catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; }
  finally { $('#submit-button').disabled = false; $('#submit-button').innerHTML = label; }
});
let activePreview = null;
function closePreview() {
  $$('.inline-preview').forEach(panel => { panel.replaceChildren(); panel.hidden = true; });
  $$('[data-preview]').forEach(button => { button.setAttribute('aria-expanded','false'); button.textContent = '▶ Vista previa'; });
  activePreview = null;
}
function showPreview(index) {
  if (activePreview === index) { closePreview(); return; }
  const track = results[index];
  if (!track?.preview_url) return;
  let url;
  try { url = new URL(track.preview_url); } catch { return; }
  if (url.protocol !== 'https:' || !['www.youtube.com','w.soundcloud.com'].includes(url.hostname)) return;
  closePreview();
  const panel = $(`#inline-preview-${index}`);
  if (!panel) return;
  const player = document.createElement('iframe');
  player.src = url.href;
  player.title = `Reproducir vista previa de ${track.title}`;
  player.className = track.source === 'soundcloud' ? 'preview-frame soundcloud-preview' : 'preview-frame';
  player.allow = 'autoplay; encrypted-media; fullscreen';
  player.referrerPolicy = 'strict-origin-when-cross-origin';
  panel.append(player);
  if (track.source === 'youtube') {
    const note = document.createElement('p');
    note.className = 'preview-note';
    note.textContent = 'YouTube no ofrece forma de onda. Busca en SoundCloud para escuchar con forma de onda.';
    panel.append(note);
  }
  panel.hidden = false;
  const button = $(`[data-preview="${index}"]`);
  button.setAttribute('aria-expanded','true');
  button.textContent = '■ Cerrar vista previa';
  activePreview = index;
}
document.addEventListener('keydown', event => { if (event.key === 'Escape') closePreview(); });
function showDetails(job,index) {
  const track = job.tracks[index]; if (!track) return;
  $('#track-detail').innerHTML = `<div class="detail-intro">${artwork(track)}<div><h3>${escapeHTML(track.title)}</h3><p>${escapeHTML(track.artist || 'Artista sin identificar')}</p></div></div><dl class="detail-grid"><dt>Álbum</dt><dd>${escapeHTML(track.album || 'Sin identificar')}</dd><dt>Género</dt><dd>${escapeHTML(track.genre || 'Sin identificar')}</dd><dt>Año</dt><dd>${escapeHTML(track.year || '—')}</dd><dt>Duración</dt><dd>${duration(track.duration)}</dd><dt>Calidad</dt><dd>MP3 · ${job.options.bitrate} kbps</dd><dt>Origen</dt><dd>${escapeHTML(track.source)}${track.audio_source_url ? ' · audio equivalente en ' + escapeHTML(track.audio_source_provider || 'youtube') : ''}</dd><dt>Estado</dt><dd>${names[track.status]}</dd></dl>${track.status === 'completed' ? `<audio class="detail-audio" controls preload="none" src="/api/jobs/${job.id}/tracks/${index}/download"></audio>` : ''}${track.error ? `<div class="form-error">${escapeHTML(track.error)}</div>` : ''}${track.warnings?.length ? `<div class="info-box">${track.warnings.map(escapeHTML).join('<br>')}</div>` : ''}<div class="lyrics">${escapeHTML(track.lyrics || 'No hay letras disponibles para esta canción.')}</div>`;
  $('#track-dialog').showModal();
}
document.addEventListener('click', async (event) => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.preview !== undefined) return showPreview(Number(button.dataset.preview));
  if (button.dataset.view) return setView(button.dataset.view);
  if (button.dataset.mode) return setMode(button.dataset.mode);
  if (button.dataset.close) { $(`#${button.dataset.close}`).close(); savePreferences(); return; }
  if (button.dataset.filter) { filter = button.dataset.filter; $$('[data-filter]').forEach(b => b.classList.toggle('selected',b === button)); return render(); }
  if (button.dataset.result !== undefined) {
    button.disabled = true;
    try { await createJob(results[Number(button.dataset.result)].source_url); } catch (error) { toast(error.message,true); }
    finally { button.disabled = false; }
    return;
  }
  const job = jobs.find(job => job.id === button.dataset.job); if (!job) return;
  const action = button.dataset.action;
  if (action === 'detail') return showDetails(job,Number(button.dataset.index));
  if (action === 'delete') { pendingDelete = job.id; return $('#confirm-dialog').showModal(); }
  if (action === 'cancel' || action === 'retry') {
    button.disabled = true;
    try { await api(`/api/jobs/${job.id}/${action}`,{method:'POST',body:'{}'}); toast(action === 'cancel' ? 'La conversión se está deteniendo.' : 'Se ha añadido un nuevo intento.'); await refresh(); }
    catch (error) { toast(error.message,true); }
    finally { button.disabled = false; }
  }
});
$('#confirm-delete').addEventListener('click',async () => {
  if (!pendingDelete) return;
  try { await api(`/api/jobs/${pendingDelete}`,{method:'DELETE'}); $('#confirm-dialog').close(); toast('Conversión eliminada.'); await refresh(); }
  catch (error) { toast(error.message,true); }
});
$('#settings-button').addEventListener('click',() => $('#settings-dialog').showModal());
$('#show-history').addEventListener('click',() => setView('history'));
$('#library-filter').addEventListener('input',render);
$('#tags-option').checked = preferences.tags; $('#lyrics-option').checked = preferences.lyrics;
$('#bitrate').value = [128,192,256,320].includes(preferences.bitrate) ? String(preferences.bitrate) : '256';
$('#tags-option').addEventListener('change',savePreferences); $('#lyrics-option').addEventListener('change',savePreferences); $('#bitrate').addEventListener('change',savePreferences);
$('#track-dialog').addEventListener('close',() => { $('#track-detail').querySelector('audio')?.pause(); });
document.addEventListener('error',(event) => { if (event.target instanceof HTMLImageElement) { const span = document.createElement('span'); span.className = 'cover cover-placeholder'; span.innerHTML = icon('music'); event.target.replaceWith(span); } },true);
async function poll() { await refresh(); setTimeout(poll,document.hidden ? 7000 : 1800); }
savePreferences(); render(); poll();
api('/api/status').then(data => { $('#spotify-info').textContent = data.spotify_configured ? `Spotify configurado. Límite de ${data.playlist_limit} canciones por lista.` : `YouTube, SoundCloud y Deezer disponibles. Spotify necesita credenciales en el servidor. Límite de ${data.playlist_limit} canciones por lista.`; }).catch(() => { $('#spotify-info').textContent = 'No se pudo consultar el servidor.'; });
if (embedded && window.parent !== window) {
  const reportHeight = () => window.parent.postMessage({type:'mp3-studio-resize',height:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)},'*');
  new ResizeObserver(reportHeight).observe(document.documentElement);
  window.addEventListener('load',reportHeight);
}
