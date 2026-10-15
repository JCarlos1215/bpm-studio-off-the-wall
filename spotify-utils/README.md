# Spotify Utils en BPM Studio

Adaptación estática para GitHub Pages del frontend de
[TheyanzXD/spotify-utils](https://github.com/TheyanzXD/spotify-utils), revisión
`a4cad680c80381610db1eb1986e6b7bff98f343e`. Conserva el flujo de búsqueda, resultados,
reproducción con anterior/siguiente y avance al terminar, y preparación/descarga de
MP3 del proyecto original. Interfaz en español, accesible y embebida en un iframe
local; no requiere desplegar Next.js ni ejecutar su servidor.

La API base está fijada a **https://alokhamil.my.id/**, como solicitó el usuario:

- `GET /api/search?q=...`: búsqueda y metadatos.
- `GET /api/stream?title=...&artist=...`: reproducción desde su proxy.
- `POST /api/download`: preparación, con cuerpo URL-encoded `title` / `artist`.
- `GET` de la ruta `streamUrl` devuelta, restringida al mismo proveedor y a
  `/api/download`, `/api/file` o `/api/stream`: descarga del archivo.

El proveedor devuelve CORS `Access-Control-Allow-Origin: *`. Su `OPTIONS` responde
405, por lo que un POST JSON no funciona con preflight desde GitHub Pages. El POST
URL-encoded es una solicitud simple admitida por su API y se ha comprobado en vivo.
No se usa un proxy alternativo, no se envían claves y no se ejecutan los scrapers
de `lib/spotsaver.js` en BPM Studio. El proveedor resuelve las fuentes aguas arriba.

El MP3 se recibe como Blob y se guarda mediante un enlace local `download`, sin
navegar fuera del iframe. Límite de descarga: 64 MB; tiempo máximo: tres minutos.
Cancelar o preparar otra pista invalida la descarga anterior y aborta la solicitud.
Cerrar/cambiar la pestaña pausa el audio. Una búsqueda nueva no cambia la lista del
reproductor que ya está sonando. Los resultados se insertan como texto, no HTML.

Los metadatos no garantizan que el audio sea la misma edición, mezcla o calidad de
Spotify. La disponibilidad, fuentes, cuotas y tiempos dependen del sitio externo.

## Créditos

Autor del proyecto original: **TheyanzXD**. Su README declara **MIT — for personal
use**; el repositorio de referencia no incluye un archivo LICENSE separado. La
adaptación conserva esta atribución y no cambia la licencia declarada del original.
El backend y el sitio externo pertenecen a su operador. BPM Studio aporta la
adaptación estática, presentación en español e integración con sus pestañas.

## Verificación

Con `python serve_project.py --port 8080` activo, ejecuta:

- `python tests/spotify-utils.py`: navegador con API simulada para resultados,
  reproducción, descarga, cancelación, errores, validación de rutas y vista móvil.
- `python tests/spotify-utils-live.py`: prueba real del proveedor con «Carefree» de
  Kevin MacLeod, reproducción y descarga, y verifica el MP3 con ffprobe. Consume
  peticiones reales del proveedor; úsala para comprobar la integración desplegada.

Requiere Playwright, Chromium en `/usr/bin/chromium` y FFmpeg/ffprobe. Ambas aceptan
`BPM_TEST_BASE_URL`. La prueba en vivo permite `BPM_TEST_ARTIFACT_DIR` para conservar
capturas de escritorio y móvil; los archivos de audio de prueba se eliminan.

## Playlist ZIP y contadores

Los cuatro contadores corresponden a intentos de conversión **de la sesión del
iframe**: total solicitado (incluye pendientes/cancelados), en procesamiento,
archivos de audio recibidos completos y fallos. Se actualizan tanto al preparar
un MP3 como al descargar una playlist; no cuentan la búsqueda o reproducción.
Se reinician al recargar, y los archivos se conservan únicamente en memoria.

Se puede añadir cada resultado a la playlist, pegar líneas `Título - Artista` o
importar un enlace completo de playlist pública de Spotify. El importador usa
`/api/spotify/playlist` del **backend Render existente de BPM Studio**, que solo
lee metadatos de `open.spotify.com/embed/playlist/{id}`. No descarga audio, no usa
las credenciales de Spotify ni modifica playlists. Esta ruta valida dominio,
HTTPS y formato de ID, y admite CORS de GitHub Pages y localhost:8080. El audio
continúa usando exclusivamente la API/proxy de **alokhamil.my.id**.

Spotify puede limitar las canciones que expone en el embed: las listas privadas,
personalizadas o inaccesibles no se importan. Se muestran hasta 50 canciones por
tanda, indicando cuándo se descartan más por el límite. La playlist se puede
editar antes de descargarla. Las canciones se reciben una por una y se empaquetan
localmente como ZIP STORE (MP3 ya está comprimido), con nombres numerados UTF-8,
`playlist.m3u8` y `reporte.txt`. Límites: 50 canciones, 64 MB por archivo y 150 MB
de audio por ZIP. La generación calcula CRC32 por bloques y permite cancelar.

Si una pista falla, se continúa con las demás y se identifica el ZIP como parcial.
Si cancelas, puedes crear un ZIP con las que ya estaban listas. Reiniciar la tanda
o editar la playlist invalida el enlace ZIP anterior. No se persisten archivos
al recargar. `python tests/spotify-playlist.py` comprueba ZIP real, CRC, nombres
Unicode, canciones intactas, reportes, contadores, importación, errores y cancelación.
