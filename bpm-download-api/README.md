# API propia para BPM

API Python/Flask, yt-dlp y FFmpeg, sin cuotas de proveedores comerciales. Usa la
misma implementación del servidor existente con su propia instancia, datos y URL.
La interfaz permite seguir varias solicitudes a la vez, cada una con cancelar y
Guardar MP3/ZIP. No evita bloqueos de origen ni promete disponibilidad de YouTube.

## Nuevo servicio Render

En Render, crear un Blueprint desde este repositorio, rama `main`, indicando
`bpm-download-api/render.yaml` como Blueprint Path. Si el formulario no ofrece esa
opción, crear un Web Service Docker con:

- Repositorio: https://github.com/JCarlos1215/bpm-studio-off-the-wall
- Dockerfile: `off-the-wall-mp3-studio/Dockerfile`
- Docker build context: `off-the-wall-mp3-studio`
- Health check: `/api/status`
- Las variables descritas en `render.yaml` de esta carpeta.

Este perfil es gratuito, con UN trabajo activo y capacidad de 100 solicitudes
pendientes/activas en total. El límite no es una cuota mensual. Tampoco es una
garantía de que todas las descargas o conversiones funcionen. Dos trabajadores
solo deben activarse tras medir memoria. La suspensión, horas gratuitas compartidas
por la cuenta y disco efímero son límites de Render. Los archivos y la cola pueden
perderse al reiniciar o redesplegar. Guardar los archivos terminados enseguida.

Tras crear el servicio, copiar su URL HTTPS real (no asumir el nombre asignado).
En Download Manager > Servidor de descargas, pegarla y pulsar Conectar. La URL se
guarda en ese navegador. Para establecerla para todos los usuarios, actualizar
`DEFAULT_API` en `spotify-utils/media.js` y publicar. Hasta entonces la interfaz
usa el backend existente. No se ha creado una nueva instancia en Render desde esta
sesión: no hay conexión ni credenciales de administración de Render disponibles.

## Capacidad para 100 descargas activas

`MAX_CONCURRENT_JOBS=100` configura 100 trabajadores: hasta 100 trabajos pueden
estar resolviendo, descargando o convirtiendo simultáneamente, sin obligación de
permanecer en la misma fase. `MAX_QUEUED_JOBS=200` permite 100 adicionales esperando
cuando los 100 primeros están activos. Los tracks de una misma playlist se procesan
en secuencia. No afirmar que una playlist individual descarga 100 pistas en paralelo.

`compose.capacity.yml` prepara un servicio único con esta configuración y límites
de 16 CPU/32 GiB para evaluación. Es una configuración inicial de prueba, NO una
estimación validada ni un mínimo suficiente para cualquier canción. Necesita un
host con esos recursos y espacio para temporales y archivos. No debe ejecutarse
en Render gratuito. No contrata ni crea recursos. Para Render de pago, elegir un
servicio con recursos apropiados y establecer esas variables después de medir el
rendimiento; no se seleccionó ni contrató ningún plan de pago.

El esquema usa un único proceso y volumen local. No soporta réplicas horizontales:
para distribuirlo entre múltiples servidores se necesita una cola compartida y
almacenamiento de objetos, que no forman parte de este perfil.

Antes de exponer 100 trabajadores: probar primero 1, 2, 5, 10 y luego aumentar;
medir RAM, CPU, espacio, tasa de errores y tiempos con medios autorizados. Supervisar
el almacenamiento y eliminar trabajos terminados con el endpoint legado DELETE
`/api/jobs/{id}` o una política de retención. Añadir control de acceso antes de
ofrecer capacidad pagada a usuarios externos. Las pruebas de concurrencia del repo
usan trabajos bloqueados artificialmente: verifican el planificador, no prueban
100 descargas remotas ni miden la capacidad de Render.

## Endpoints para la interfaz

- `GET /api/media/config`: proveedor, trabajadores y capacidad de cola.
- `POST /api/media/jobs`: `{url, bitrate: 192, playlist: false}`; devuelve 202 y job.
- `GET /api/media/jobs/{id}`: progreso y tracks.
- `POST /api/media/jobs/{id}/cancel`: cancelar.
- `GET /api/media/jobs/{id}/tracks/{index}/download`: MP3.
- `GET /api/media/jobs/{id}/archive`: ZIP de los tracks terminados.

POST requiere `X-Requested-With: AllToMP3`. CORS admite la web BPM de GitHub Pages
y localhost:8080. No se necesitan claves de RapidAPI ni Apify. Para mantener el
adaptador anterior, configurar `BPM_MEDIA_ENGINE=apify` (ver `spotify-utils/APIFY.md`).
