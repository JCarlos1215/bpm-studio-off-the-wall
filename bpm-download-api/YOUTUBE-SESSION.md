# Sesión autorizada de YouTube en Render

El backend ya admite una sesión propia mediante el mecanismo cookiefile de
yt-dlp. Una ventana de Google OAuth en la página no transmite esa sesión al
servidor ni concede autorización de descarga. No se añadió un formulario de
contraseña ni un endpoint público para recibir cookies.

## Configuración desde la cuenta del propietario

1. Obtener una exportación propia y vigente en formato Netscape siguiendo la
   documentación oficial: https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies
   Usar únicamente acceso autorizado al contenido.
2. En el dashboard de Render, abrir el servicio de descargas que usa BPM:
   `jcarlos1215-bpm-studio-off-the-wall-mp3` (o la instancia nueva conectada).
3. En Environment > Secret Files, crear `youtube-cookies.txt` con esa exportación.
   No subirla a GitHub, a Download Manager, ni al chat.
4. Añadir la variable `YTDLP_COOKIES_FILE=/etc/secrets/youtube-cookies.txt`.
5. Guardar y desplegar. Render monta el Secret File; el descargador usa una copia
   temporal con permiso 0600 y la elimina al terminar. El original no se modifica.

## Verificar el despliegue

Consultar `GET /api/status`, campo `downloader.youtube_session`:

- `configured`: existe una ruta configurada en el entorno.
- `readable`: esa ruta es un archivo legible para el proceso.
- `authentication_verified`: `false`; la presencia del archivo no demuestra que
  YouTube acepte esa sesión. Este campo no se cambia automáticamente a true.

El diagnóstico solo consulta metadatos del archivo: no devuelve rutas ni cookies.
Una prueba real debe solicitar el enlace original en Download Manager y comprobar
que se obtiene un MP3 completo. Un rechazo de verificación o acceso se muestra
como error, sin cambiar el enlace por otra canción ni abrir un login ficticio.

Este ajuste no garantiza que el acceso funcione: la sesión puede caducar o ser
rechazada. Ante un bloqueo, no hacer reintentos masivos ni intentar eludir el
control. Una sesión rechazada requiere revisión por su propietario y un método
permitido por la plataforma. Para retirarla, eliminar la variable y el Secret
File y redesplegar; gestionar la sesión de cuenta desde los controles de Google.

## Estado de la prueba

El soporte y sus pruebas automatizadas están implementados. No hay una sesión
personal ni acceso de administración de Render proporcionados en este entorno.
La prueba autenticada requiere que el propietario configure el Secret File.
