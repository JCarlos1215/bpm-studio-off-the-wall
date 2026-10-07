const embedded = new URLSearchParams(location.search).has('embed');
if (embedded) document.documentElement.classList.add('embedded');
const separator = document.querySelector('#separator');
document.querySelector('#reload').addEventListener('click', () => {
  document.querySelector('#status').textContent = 'Recargando el separador dentro de BPM Studio…';
  separator.src = 'https://thestinger-uvr5-ui.hf.space/?__theme=dark';
});
if (embedded && window.parent !== window) {
  const resize = () => window.parent.postMessage({type:'stems-resize',height:document.documentElement.scrollHeight},location.origin);
  new ResizeObserver(resize).observe(document.body);
  window.addEventListener('load',resize);
}
