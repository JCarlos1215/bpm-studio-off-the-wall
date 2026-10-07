// The local launcher serves the bundled Flask backend on port 8093.
// Public service address; secrets stay on Render.
const localHosts = ['localhost', '127.0.0.1'];
export const DOWNLOAD_API = localHosts.includes(window.location.hostname)
  ? `${window.location.protocol}//${window.location.hostname}:8093`
  : 'https://jcarlos1215-bpm-studio-off-the-wall-mp3.onrender.com';
