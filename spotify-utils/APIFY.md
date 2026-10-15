# YouTube mediante Apify

Download Manager usa exclusivamente una tarea de
`business_development/youtube-4k-long-video-downloader` para las nuevas solicitudes
YouTube. No recurre a yt-dlp si Apify falla. Los servicios antiguos del backend
conservan su motor; Spotify sigue usando alokhamil.my.id y su ZIP actual.

## Activación

1. Crear una tarea (Task) del actor en Apify. Configurar allí el almacenamiento
   de salida que exige el actor (S3, GCS, Azure o Drive), con permisos limitados.
   Esas credenciales se guardan en Apify, nunca en el navegador o repositorio.
2. Examinar una ejecución controlada: el dataset debe entregar un único item
   con un enlace HTTPS directo al audio. El campo por defecto es `downloadUrl`.
   Si el actor usa otro campo, configurar `APIFY_OUTPUT_URL_FIELD` (admite rutas
   como `output.url`). No se ha verificado aún el contrato de salida real de este
   actor: requiere una cuenta con saldo y almacenamiento configurado. Si el
   actor no expone un enlace descargable en su dataset, este adaptador lo
   rechazará y habrá que adaptar su salida antes de habilitarlo.
3. En Render > servicio MP3 > Environment, guardar el secreto `APIFY_TOKEN`,
   el identificador `APIFY_TASK_ID`, y `APIFY_DOWNLOAD_HOSTS` con los hosts
   exactos del almacenamiento de salida (por ejemplo el host del bucket).
   No se permiten redirecciones, páginas HTML ni credenciales incrustadas en URL.
4. Redesplegar y comprobar `/api/media/config`: `configured: true` significa que
   existen las variables necesarias, no que una descarga real esté verificada.
5. Probar un video público corto y comprobar el archivo, el coste y el estado
   de la ejecución en Apify antes de ofrecerlo a usuarios.

El adaptador fuerza `quality: audio-only`, `format: mp3`, un único video público,
y desactiva cookies y proxy de Apify. No intenta acceder a contenido restringido.
La calidad seleccionada en la interfaz se aplica al MP3 final mediante FFmpeg;
no mejora la calidad de la fuente. SoundCloud y playlists YouTube no están
admitidos por esta nueva integración. El ZIP opcional contiene ese único MP3.

## Límites de la prueba

Cada ejecución solicita `maxTotalChargeUsd=0.50`, timeout 600 s y memoria 4096 MB.
El presupuesto puede ser insuficiente según la tarifa vigente. Apify puede
cobrar inicios o eventos aunque no se obtenga un archivo, y su límite no cubre
costes externos del almacenamiento. Revisar la consola de facturación.

Se admiten 5 solicitudes por día UTC dentro de la base local de trabajos. En el
Render gratuito esa base es efímera: un redespliegue puede reiniciar el contador.
Para un límite monetario global, usar los límites de cuenta de Apify y acceso
controlado al servicio. Las llamadas públicas de la aplicación consumen saldo.
Cancelación y timeout intentan abortar la ejecución remota; comprobar su estado
en Apify si hubo un fallo de conexión. Un reinicio local no confirma ese aborto.

El servidor recibe el audio con un máximo de 64 MB, valida que sea MP3 y que dure
hasta 30 minutos y entrega el archivo local al navegador. El cliente no recibe
el token, las credenciales de almacenamiento ni URLs firmadas del proveedor.
Sin configuración el formulario queda deshabilitado con un aviso, sin generar
cargos ni cambiar silenciosamente de proveedor.
