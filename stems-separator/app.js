const embedded = new URLSearchParams(location.search).has('embed');
if (embedded) document.documentElement.classList.add('embedded');
const separator = document.querySelector('#separator');
const engines = {
  browser: {url:new URL('../stems-browser/?embed=1&v=bundled-1',location.href).href,note:'Sin cuota de servidor · Demucs procesa el audio en este dispositivo. No hace falta encender tu Mac si usas otro equipo.',privacy:'Tu audio no se sube a un servidor. La primera ejecución carga el modelo integrado de unos 172 MB; el rendimiento depende del equipo.'},
  uvr: {url:'https://thestinger-uvr5-ui.hf.space/?__theme=dark',note:'GPU compartida gratuita · UVR5 con Roformer y Demucs. Puedes usarlo desde móvil, tablet o computadora.',privacy:'El audio se sube al servicio público TheStinger/UVR5_UI en Hugging Face. Puede haber colas, cuota diaria o solicitud de inicio de sesión.'},
  demucs: {url:'https://abidlabs-music-separation.hf.space/?__theme=dark',note:'GPU compartida gratuita · Demucs. Sube el archivo y pulsa el botón de separación del panel.',privacy:'El audio se sube al servicio público abidlabs/music-separation en Hugging Face. Puede haber colas, cuota diaria o solicitud de inicio de sesión.'},
  local: {url:new URL('../stems-studio/?embed=1&v=free-20261007-1',location.href).href,note:'stemd Quality · voces, batería y armónicos. El motor de tu Mac debe estar encendido y accesible desde este navegador.',privacy:'El audio se procesa en tu Mac. Esta opción local no ofrece acceso desde otros dispositivos sin configurar un servidor remoto.'}
};
function activate(){
  const name=document.querySelector('#engine').value,engine=engines[name];
  separator.src=engine.url;
  document.querySelector('#engine-note').textContent=engine.note;
  document.querySelector('#privacy').textContent=engine.privacy;
  document.querySelector('#uvr-guide').hidden=name!=='uvr';
  document.querySelector('#status').textContent='Cargando el separador dentro de BPM Studio…';
}
document.querySelector('#engine').addEventListener('change',activate);
document.querySelector('#reload').addEventListener('click', () => {
  activate();
});
separator.addEventListener('load',()=>{document.querySelector('#status').textContent='Panel cargado. Selecciona tu audio y mantén esta pestaña abierta durante la separación.';});
window.addEventListener('message',event=>{
  if(event.source===separator.contentWindow&&event.origin===location.origin&&event.data?.type==='stems-studio-resize'){
    const height=Number(event.data.height);if(Number.isFinite(height))separator.style.height=`${Math.max(720,Math.min(6000,height))}px`;
  }
  if(event.source===parent&&event.origin===location.origin&&event.data?.type==='stems-studio-visibility'&&['local','browser'].includes(document.querySelector('#engine').value))separator.contentWindow?.postMessage(event.data,location.origin);
});
if (embedded && window.parent !== window) {
  const resize = () => window.parent.postMessage({type:'stems-resize',height:document.documentElement.scrollHeight},location.origin);
  new ResizeObserver(resize).observe(document.body);
  window.addEventListener('load',resize);
}
