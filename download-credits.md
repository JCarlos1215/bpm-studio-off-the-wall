# Gestor de descargas Off The Wall

Adaptación web del flujo de [GDownloader](https://github.com/hstr0100/GDownloader), de hstr0100. Revisión de referencia: f78416a13170037e76537fe01729b9b89ca5ff8f. No es la aplicación Java ejecutándose dentro de la página.

Incluye cola por lotes, filtros, prioridad, reintentos, restauración opcional, ajustes de audio/video, listas, galerías y coincidencias Spotify → YouTube. Los motores son yt-dlp, gallery-dl y spotDL; FFmpeg prepara los archivos.

[Descargar código fuente del gestor y servidor](downloads-source.zip). El archivo incluye instrucciones, pruebas, créditos y un mapa de funciones implementadas y no portadas. Los módulos nuevos del gestor están bajo [GPL-3.0-or-later](downloads-LICENSE.txt). El logo del usuario queda fuera de esa licencia.

## Límites de esta adaptación

No reproduce todas las funciones de escritorio: no vigila el portapapeles, no instala software en tu teléfono, no importa cookies de cuentas y no incluye argumentos avanzados, SponsorBlock, mezcla de múltiples pistas ni ajustes expertos por plataforma. Las actualizaciones y GPU se administran en el servidor. La pausa solo detiene los siguientes trabajos.

Spotify permite buscar coincidencias en YouTube; no se extrae audio de Spotify y el resultado puede corresponder a otra versión. La compatibilidad de cualquier plataforma está sujeta a cambios y restricciones.

Hasta 20 elementos por lista/galería, 30 minutos y 250 MB por archivo, 500 MB por lote. Los resultados caducan a los 30 minutos. No se solicita una clave en la página.

**Estado:** servidor todavía pendiente de despliegue. La cola se puede organizar; las descargas no se activan hasta conectar el servidor.
