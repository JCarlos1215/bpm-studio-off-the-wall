# BPM Studio Off The Wall

**Analizador BPM y convertidor multimedia para DJ**, con procesamiento local y Download Manager integrado.

## ✨ Características

- **Analizador BPM en tiempo real** con micrófono, espectro, onda y mediciones de señal
- **Procesamiento de audio/video** en el navegador vía `@ffmpeg/ffmpeg` (WebAssembly)
- **Download Manager** con búsqueda musical, biblioteca, historial y etiquetas ID3
- **Rekordbox Explorer** para explorar y audicionar una biblioteca USB directamente en el navegador
- **Analizador DJ local** para estimar tonalidad, Camelot, BPM, energía y sugerir Hot Cues
- **Video de fondo local** convertido a un formato compatible con navegadores

## 🛠 Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | HTML, CSS, JavaScript (ESM) |
| Procesamiento multimedia | `@ffmpeg/ffmpeg` 0.12.15 (MIT), `@ffmpeg/core` 0.12.10 (GPLv3) |
| Conversión local | `@ffmpeg/ffmpeg` y WebAssembly |
| Download Manager | Python, Flask, yt-dlp y FFmpeg |
| Rekordbox Explorer | React, Vite y TypeScript; lectura local de la USB |
| Ejecución | Frontend estático y servidor local para Download Manager |

## 🌐 Versión web

La versión estática está publicada en [GitHub Pages](https://jcarlos1215.github.io/bpm-studio-off-the-wall/).
El analizador BPM, el convertidor, Rekordbox Explorer y el analizador DJ funcionan en el
navegador. Download Manager se conecta al servidor Python gratuito de Render; puedes elegir
acceder sin contraseña desde cualquier dispositivo. El servidor queda abierto para quien
tenga el enlace y puede tardar cerca de un minuto en despertar después de estar inactivo. Su
almacenamiento no es permanente; descarga tus conversiones antes de que el servicio se
reinicie. Para configurar tu propia instancia, sigue las instrucciones de
[`off-the-wall-mp3-studio/README.md`](off-the-wall-mp3-studio/README.md#render-gratuito).

## 🚀 Puesta en marcha local

```bash
# Clonar el repositorio
git clone https://github.com/JCarlos1215/bpm-studio-off-the-wall.git
cd bpm-studio-off-the-wall
```

En macOS, inicia todo el proyecto con `Iniciar BPM Studio.command`. La página, el video
de fondo, Rekordbox Explorer y el analizador DJ se sirven desde esta carpeta en
`127.0.0.1`; no se carga una página principal alojada en otro sitio.

La primera vez, prepara las dependencias Python de Download Manager con conexión a Internet:

```bash
./off-the-wall-mp3-studio/Iniciar.command
```

Cuando aparezca el servidor, detenlo con `Ctrl+C` y abre `Iniciar BPM Studio.command`.
Mantén abierta la ventana de Terminal mientras uses BPM Studio; al cerrarla, se detienen
los servidores locales. Requiere Python 3 instalado. El análisis de audio, la conversión,
Rekordbox Explorer, el video de fondo y el analizador DJ funcionan localmente; las
búsquedas y descargas de Download Manager requieren conexión a servicios externos.

### Download Manager

El servidor local de Download Manager se inicia automáticamente con el comando principal. Para
instalar o administrar sus dependencias, consulta
[`off-the-wall-mp3-studio/README.md`](off-the-wall-mp3-studio/README.md).

**Rekordbox Explorer** se sirve desde su build local en `rekordbox-explorer-main/dist/` y se muestra dentro de esta página. Selecciona una carpeta USB en Chrome, Edge u Opera; otros navegadores pueden seleccionar `export.pdb`. El análisis de la biblioteca ocurre en el navegador, sin subir archivos.

El **Analizador DJ** se encuentra en `key-bpm-analyzer/`. Sus estimaciones son orientativas;
consulta sus límites y detalles en [`key-bpm-analyzer/README.md`](key-bpm-analyzer/README.md).

## 📸 Capturas de pantalla

| Vista | Descripción |
|-------|-------------|
| Analizador BPM | Tempo y señal de audio en tiempo real |
| Convertidor | Conversión local de audio y video |
| Download Manager | Búsqueda y biblioteca musical |

*Añade capturas reales en la carpeta `screenshots/`.*

## 📄 Licencia y créditos

- Download Manager (basado en AllToMP3 Web): **AGPL-3.0-or-later** — ver [su licencia](off-the-wall-mp3-studio/LICENSE)
- `@ffmpeg/ffmpeg` wrapper: **MIT** — ver `vendor/license-wrapper.txt`
- `@ffmpeg/core` (binario WASM + codecs): **GPLv3** — ver `vendor/license-gplv3.txt`
- Logo de usuario: fuera de licencia GPL

> **Nota**: Download Manager requiere el servidor Python local. La conversión de archivos del navegador permanece en este dispositivo.
### Reparación de Download Manager (6 de octubre de 2026)

El iframe activo (`mp3Frame` en `index.html`) utiliza `https://jcarlos1215-bpm-studio-off-the-wall-mp3.onrender.com`, el backend incluido en este repositorio. Los archivos antiguos `downloader.js` y `downloader-config.js` no se cargan desde la página actual; su dirección `descargador-pro-co95.onrender.com` pertenece a otra aplicación. En localhost el iframe utiliza el puerto 8093 que levanta el iniciador.

El flujo conserva la arquitectura de AllToMP3: SoundCloud se extrae desde su enlace; Spotify resuelve metadatos (API o embed público) y busca audio equivalente en YouTube. El archivo no procede del audio protegido de Spotify y puede corresponder a otra versión. Se instala `yt-dlp[default]` para mantener compatibles los componentes EJS. `/api/status` expone sus versiones y la disponibilidad de Node.js 22 o posterior.

GitHub Pages sirve la rama `main`; el backend Render está conectado a `master`. Ambas ramas deben contener las correcciones. Después de desplegar, comprueba `/api/status` y una conversión desde la IP de Render: la extracción local no demuestra que YouTube acepte solicitudes del servidor.

### Stems Studio sin cuota de servidor

La pestaña **Stems Studio** usa por defecto **Demucs ONNX en el dispositivo** (`stems-browser/`). No consume minutos de GPU compartida ni sube audio a un servidor. Se descarga un modelo de aproximadamente 172 MB y el navegador realiza la inferencia en un Worker. Entrega batería, bajo, otros instrumentos y voces con reproducción, ondas y WAV float32 dentro del iframe.

No hay contador diario de canciones o solicitudes. La memoria y velocidad del equipo siguen limitando las pistas que puede procesar; WebGPU se usa cuando está disponible; WASM en un solo hilo puede ser lento. Abre la plataforma publicada por HTTPS o el servidor local, no index.html mediante `file://`. Ver [instrucciones](stems-browser/README.md).

El selector conserva **stemd Quality local** para usar la Mac, y los servicios públicos UVR5/Demucs como alternativas identificadas **con cuota**. Cambiar entre esos servicios públicos no elimina su cuota compartida. Los motores locales son distintos de Mixed In Key; no se promete igualdad de calidad con ese producto. No se creó ningún servicio de pago.

### Preparador de audio

La pestaña **Preparador de audio** funciona en un iframe propio, con FFmpeg
WebAssembly ya incluido en este repositorio. Procesa una pista de hasta 60 MB y
10 minutos por vez sin subirla. Perfiles: Natural (−16 LUFS), DJ (−12 LUFS) y
Potente (−10 LUFS). Analiza sonoridad integrada, pico verdadero y LRA, aplica
normalización en dos pasadas y vuelve a medir el archivo exportado. Comprueba el
techo solicitado de −1 o −2 dBTP y, si hace falta, reduce la ganancia y verifica
otra vez. Exporta WAV de 24 bits o FLAC a 44,1 o 48 kHz, con comparación A/B y
volumen de reproducción igualado opcionalmente. La cancelación termina el worker;
un cambio de ajustes invalida la copia anterior.

El tratamiento previo puede aplicar un filtro de 10 Hz y `adeclip` (reconstrucción
aproximada de clipping). No recupera información perdida ni garantiza una mejora
perceptual. Las mediciones de archivos cortos, especialmente LRA, requieren
interpretación. El navegador, la duración y la memoria condicionan el tiempo de
procesamiento. La salida no conserva las etiquetas del original.

Es una implementación independiente inspirada en la preparación de bibliotecas
que describe [Platinum Notes 10](https://mixedinkey.com/platinum-notes/). No utiliza
su código o sus algoritmos propietarios, no replica el producto ni ofrece
corrección de afinación. Utiliza las licencias de FFmpeg ya documentadas en
`vendor/`; el audio original se conserva sin modificar.

Con `python serve_project.py --port 8080` activo, ejecuta
`python tests/audio-enhancer.py` para comprobar el procesamiento real en Chromium,
el archivo exportado, la comparación A/B, la cancelación, los errores de entrada
y la interfaz móvil. Requiere Playwright y Chromium instalados.
