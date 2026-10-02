# BPM Studio Off The Wall

**Adaptación web de un gestor de descargas multimedia** con cola por lotes, coincidencias Spotify → YouTube y procesamiento local mediante FFmpeg.

---

## ✨ Características

- **Cola por lotes** con prioridad, filtros y reintentos automáticos
- **Coincidencias Spotify → YouTube** (búsqueda, no extracción directa de audio)
- **Motores de descarga**: yt-dlp, gallery-dl, spotDL
- **Procesamiento de audio/video** en el navegador vía `@ffmpeg/ffmpeg` (WebAssembly)
- **Listas y galerías** (hasta 20 elementos)
- **Límites**: 30 min / 250 MB por archivo, 500 MB por lote, resultados expiran a 30 min
- **Restauración opcional** de cola y ajustes de formato

> ⚠️ **Estado actual**: Servidor pendiente de despliegue. La interfaz permite organizar la cola; las descargas no se activan hasta conectar el backend.

---

## 🛠 Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | HTML, CSS, JavaScript (ESM) |
| Procesamiento multimedia | `@ffmpeg/ffmpeg` 0.12.15 (MIT), `@ffmpeg/core` 0.12.10 (GPLv3) |
| Motores de descarga (servidor) | yt-dlp, gallery-dl, spotDL, FFmpeg |
| Despliegue objetivo | Vercel (frontend estático) |

---

## 🚀 Puesta en marcha

```bash
# Clonar el repositorio
git clone https://github.com/JCarlos1215/bpm-studio-off-the-wall.git
cd bpm-studio-off-the-wall

# Servir estáticamente (ejemplo con npx serve)
npx serve .
# Abre http://localhost:3000
```

> El motor FFmpeg WASM se carga bajo demanda al iniciar una conversión. Los medios se procesan en un Web Worker en el dispositivo del usuario.

---

## 🔗 Demo

[Enlace a la demo en Vercel](#) *(pendiente de despliegue)*

---

## 📸 Capturas de pantalla

| Vista | Descripción |
|-------|-------------|
| `![Cola de descargas](screenshots/queue.png)` | Cola por lotes con prioridad y filtros |
| `![Coincidencia Spotify](screenshots/spotify-match.png)` | Búsqueda de coincidencias en YouTube |
| `![Ajustes de formato](screenshots/settings.png)` | Configuración de audio/video |

*Añade capturas reales en la carpeta `screenshots/`.*

---

## 📋 Próximas mejoras

- [ ] Desplegar backend (API de descargas y cola persistente)
- [ ] Autenticación y gestión de cookies para plataformas privadas
- [ ] Soporte para SponsorBlock y argumentos avanzados por plataforma
- [ ] Vigilancia de portapapeles (PWA)
- [ ] Pruebas E2E y CI/CD
- [ ] Documentación de API del servidor

---

## 📄 Licencia y créditos

- Código del gestor (módulos nuevos): **GPL-3.0-or-later** — ver `downloads-LICENSE.txt`
- `@ffmpeg/ffmpeg` wrapper: **MIT** — ver `vendor/LICENSE-wrapper.txt`
- `@ffmpeg/core` (binario WASM + codecs): **GPLv3** — ver `vendor/LICENSE-GPLv3.txt`
- Basado en [GDownloader](https://github.com/hstr0100/GDownloader) (ref. f78416a) de hstr0100
- Logo de usuario: fuera de licencia GPL

---

> **Nota**: Esta es una adaptación web, no la aplicación Java original ejecutándose en el navegador. La compatibilidad de plataformas está sujeta a cambios y restricciones externas.