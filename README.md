# BPM Studio Off The Wall

**Analizador BPM y convertidor multimedia para DJ**, con procesamiento local y Off The Wall MP3 Studio integrado.

## ✨ Características

- **Analizador BPM en tiempo real** con micrófono, espectro, onda y mediciones de señal
- **Procesamiento de audio/video** en el navegador vía `@ffmpeg/ffmpeg` (WebAssembly)
- **MP3 Studio** con búsqueda musical, biblioteca, historial y etiquetas ID3
- **Rekordbox Explorer** para explorar y audicionar una biblioteca USB directamente en el navegador
- **Analizador DJ local** para estimar tonalidad, Camelot, BPM, energía y sugerir Hot Cues
- **Video de fondo local** convertido a un formato compatible con navegadores

## 🛠 Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | HTML, CSS, JavaScript (ESM) |
| Procesamiento multimedia | `@ffmpeg/ffmpeg` 0.12.15 (MIT), `@ffmpeg/core` 0.12.10 (GPLv3) |
| Conversión local | `@ffmpeg/ffmpeg` y WebAssembly |
| MP3 Studio | Python, Flask, yt-dlp y FFmpeg |
| Rekordbox Explorer | React, Vite y TypeScript; lectura local de la USB |
| Ejecución | Frontend estático y servidor local para MP3 Studio |

## 🌐 Versión web

La versión estática está publicada en [GitHub Pages](https://jcarlos1215.github.io/bpm-studio-off-the-wall/).
El analizador BPM, el convertidor, Rekordbox Explorer y el analizador DJ funcionan en el
navegador. MP3 Studio se conecta al servidor Python gratuito de Render; puedes elegir
recordar la contraseña en el navegador para conectarte automáticamente en futuras visitas.
El servidor puede tardar cerca de un minuto en despertar después de estar inactivo. Su
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

La primera vez, prepara las dependencias Python de MP3 Studio con conexión a Internet:

```bash
./off-the-wall-mp3-studio/Iniciar.command
```

Cuando aparezca el servidor, detenlo con `Ctrl+C` y abre `Iniciar BPM Studio.command`.
Mantén abierta la ventana de Terminal mientras uses BPM Studio; al cerrarla, se detienen
los servidores locales. Requiere Python 3 instalado. El análisis de audio, la conversión,
Rekordbox Explorer, el video de fondo y el analizador DJ funcionan localmente; las
búsquedas y descargas de MP3 Studio requieren conexión a servicios externos.

### Off The Wall MP3 Studio

El servidor local de MP3 Studio se inicia automáticamente con el comando principal. Para
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
| MP3 Studio | Búsqueda y biblioteca musical |

*Añade capturas reales en la carpeta `screenshots/`.*

## 📄 Licencia y créditos

- Off The Wall MP3 Studio: **AGPL-3.0-or-later** — ver [su licencia](off-the-wall-mp3-studio/LICENSE)
- `@ffmpeg/ffmpeg` wrapper: **MIT** — ver `vendor/license-wrapper.txt`
- `@ffmpeg/core` (binario WASM + codecs): **GPLv3** — ver `vendor/license-gplv3.txt`
- Logo de usuario: fuera de licencia GPL

> **Nota**: MP3 Studio requiere el servidor Python local. La conversión de archivos del navegador permanece en este dispositivo.