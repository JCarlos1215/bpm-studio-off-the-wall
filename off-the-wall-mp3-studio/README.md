# AllToMP3 Web

Aplicación web en español basada en los flujos de [AllToMP3](https://github.com/AllToMP3). Interfaz adaptable a móvil y escritorio, servidor Python y conversión real con FFmpeg. No contiene conversiones simuladas.

Diseño adaptado de [BPM Studio Off The Wall](https://github.com/JCarlos1215/bpm-studio-off-the-wall): logo original centrado, fondo negro, acentos azules, paneles de cristal y navegación horizontal. Incluye un resumen de conversiones, canciones listas y errores. En el navegador se identifica como **Off The Wall — MP3 Studio**.

## Inicio rápido en Mac

La carpeta contiene el servidor y todos los archivos de la interfaz. Para usar MP3 Studio
dentro de la página principal del proyecto, inicia `../Iniciar BPM Studio.command`: ese
iniciador levanta ambos servicios en `127.0.0.1` y muestra este proyecto en el iframe sin
cargar la interfaz desde una web externa.

Para iniciar únicamente MP3 Studio, abre `Iniciar.command` o ejecuta:

```sh
cd /Users/otw/alltomp3-web
.venv/bin/python app.py
```

Abre **http://127.0.0.1:8093**. Mantén el servidor abierto mientras usas la aplicación. Para detenerlo, pulsa Ctrl+C en Terminal.

La interfaz local y la biblioteca no necesitan Internet para abrirse. Buscar o descargar
música sí requiere conexión con las plataformas de origen; esas funciones no se pueden
usar sin conexión.

Para instalar en otro equipo (Python 3.11 o posterior):

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python app.py
```

FFmpeg viene incluido mediante `imageio-ffmpeg`. También puedes indicar `FFMPEG_PATH` para usar una instalación propia. Para extraer audio de YouTube instala Node.js 20 o posterior: yt-dlp lo utiliza para resolver los desafíos JavaScript. Este Mac ya tiene Node.js.

## Funciones

| AllToMP3 original | Versión web |
| --- | --- |
| Buscar una canción por texto | Buscar canción: resultados, artista, duración y conversión |
| YouTube y SoundCloud | Enlaces individuales y listas públicas con yt-dlp |
| Spotify y Deezer | Datos de canción, álbum y lista; búsqueda del audio en YouTube |
| MP3 a 256 kbps | 128, 192, 256 (predeterminado) o 320 kbps |
| Metadatos | Etiquetas ID3: título, artista, álbum, género, año y número de pista |
| Portadas y letras | Portada incrustada y letra cuando los proveedores las entregan |
| Eventos de avance | Cola con estados y progreso de descarga y conversión |
| Descarga de listas | MP3 individual y ZIP de las pistas convertidas |
| Carpeta de salida de escritorio | Descarga desde el navegador al destino que el usuario elija |

También incluye biblioteca con filtro, historial persistente en SQLite, reproducción de MP3, detalles de canción, cancelación, reintentos y eliminación de archivos.

La migración sustituye las dependencias antiguas de Node/Electron del original por Flask, yt-dlp, FFmpeg y Mutagen. El módulo original se conserva como referencia separada en `../alltomp3-web-reference`; no se ejecuta ni se usan sus claves incrustadas.

## Cómo usarlo

1. En **Enlace**, pega una canción de YouTube o SoundCloud. También admite una canción de Spotify o Deezer.
2. En **Buscar canción**, escribe artista y título; elige un resultado para convertir.
3. En **Lista o álbum**, pega una lista pública o álbum compatible.
4. Elige la calidad; en **Preferencias** puedes activar etiquetas y letras.
5. La cola muestra las etapas reales. Descarga el MP3 terminado o el ZIP al terminar la lista.
6. En **Mi biblioteca** puedes filtrar y reproducir los archivos. **Historial** permite reintentar o eliminar.

## Spotify

Crea una aplicación en Spotify for Developers y configura las credenciales propias en `.env`:

```dotenv
SPOTIFY_CLIENT_ID=tu_client_id
SPOTIFY_CLIENT_SECRET=tu_client_secret
```

Se usa el flujo Client Credentials. Las credenciales permanecen en el servidor y no se entregan al navegador. El acceso a listas depende de los permisos y restricciones vigentes de la aplicación Spotify. Si Spotify rechaza el recurso, la interfaz muestra el error; no inventa resultados. Las listas privadas y los recursos que requieren acceso de usuario no están soportados por este flujo.

Spotify y Deezer proporcionan metadatos, no el audio original. Como en AllToMP3, se busca una coincidencia en YouTube; puede ser otra versión, y no se garantiza que sea la grabación exacta. No se elimina DRM.

## Límites y diferencias

- Las descargas en línea dependen de la disponibilidad y restricciones de cada plataforma. YouTube puede exigir verificación; no se incluye una sesión ni cookies personales. SoundCloud privado o de pago no está soportado.
- Los resultados de búsqueda son de YouTube. Deezer y Spotify se importan por enlace.
- Etiquetas adicionales se consultan en iTunes; las letras en LRCLIB. Una coincidencia no encontrada conserva los metadatos del enlace y muestra un aviso cuando corresponde.
- No se porta la identificación acústica Chromaprint/AcoustID del módulo original. La identificación se basa en metadatos y coincidencias de texto; no garantiza identificar canciones cuyo título o artista falten.
- 100 canciones por lista, 30 minutos y 200 MB por pista, 8 trabajos pendientes y 2 trabajos simultáneos de forma predeterminada. Ajusta los límites de listas y concurrencia en `.env`.
- La cola procesa una lista secuencialmente. La cancelación detiene FFmpeg y la descarga en su siguiente actualización; las consultas HTTP en curso pueden tardar hasta su timeout en terminar.
- Las tareas interrumpidas por un reinicio se marcan como fallidas. Se conservan los MP3 terminados y se pueden reintentar las conversiones. Un reintento crea una tarea nueva, también para las pistas que ya habían terminado.
- Los archivos no caducan automáticamente. Elimina una entrada del historial para borrar sus MP3 y ZIP del servidor.
- Un bitrate más alto no mejora una fuente de baja calidad.

## Despliegue con Docker

```sh
cp .env.example .env
# Configura APP_PASSWORD en .env antes de ejecutar Docker.
docker compose up --build -d
```

Abre `http://localhost:8093`. Usa cualquier nombre de usuario y la contraseña de `APP_PASSWORD`. Docker conserva SQLite y MP3 en el volumen `alltomp3-data`.

Para alojamiento remoto usa un servidor con disco persistente y soporte para procesos FFmpeg, por ejemplo una VM o un servicio de contenedores. Pon HTTPS delante mediante un proxy inverso y configura `APP_PASSWORD`. Ejecuta **una instancia** del servidor para esta implementación de la cola. No se debe ejecutar con múltiples procesos compartiendo SQLite: los trabajadores están en memoria.

El backend no se puede ejecutar íntegramente en hosting estático ni en Cloudflare Workers/Sites: necesita binarios, subprocesos y almacenamiento en disco. Este proyecto se entrega ejecutable localmente y con configuración Docker; no se ha publicado un frontend desconectado de su servidor.

## Verificación

```sh
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
node --check static/app.js
```

Las pruebas generan un WAV original y lo convierten realmente con FFmpeg. Comprueban bitrate, etiquetas ID3 y letras, descarga HTTP, ZIP, persistencia, recuperación tras reinicios, cancelación, reintentos, validación de enlaces, protección de escrituras y contraseña. El extractor en esos tests se sustituye por una fuente local determinista; no equivalen a verificar todas las plataformas en vivo.

## Estructura

```text
app.py              API y servidor Waitress
engine.py           Cola SQLite, conversión, etiquetas y archivos
providers.py        YouTube, SoundCloud, Spotify, Deezer, iTunes, LRCLIB
static/             Interfaz HTML, CSS, JS e iconos
tests/              Pruebas con conversión real
Iniciar.command     Inicio local en Mac
Dockerfile          Contenedor con FFmpeg y Node
compose.yaml        Ejecución con disco persistente
.env.example        Configuración sin credenciales
```

## Créditos y licencia

Proyecto de referencia: [AllToMP3/alltomp3](https://github.com/AllToMP3/alltomp3), Basile Bruneau y colaboradores, revisión `7ea827e9fa20843ff3dbf53d0ae4927d13d5d715`. Interfaz de referencia: [AllToMP3/alltomp3-app](https://github.com/AllToMP3/alltomp3-app). Esta implementación se distribuye bajo AGPL-3.0-or-later; ver `LICENSE` y `NOTICE.md`. Se incluyen enlaces al proyecto original en la interfaz.

Fuentes técnicas: [API de yt-dlp](https://github.com/yt-dlp/yt-dlp#embedding-yt-dlp), [Spotify Client Credentials](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow), [LRCLIB](https://lrclib.net/docs).
