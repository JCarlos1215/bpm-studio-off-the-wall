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
