# Demucs en el dispositivo, sin cuota diaria de separación

Integra demucs-web 1.0.2 (MIT), ONNX Runtime Web 1.23.2 y HTDemucs ONNX para
navegadores. El modelo ocupa unos 172 MB y está incluido en models/;
no se utilizan Hugging Face Spaces ni GPU compartida. El audio permanece local.

La biblioteca realiza FFT, inferencia por segmentos y reconstrucción con
solapamiento dentro de un Worker. Se usa CPU/WASM para evitar presión sobre la memoria de la GPU.
El modo WASM se limita a un hilo para
funcionar en GitHub Pages sin cabeceras COOP/COEP.

No hay contador de canciones, minutos o solicitudes de separación. La memoria,
velocidad y compatibilidad del navegador siguen imponiendo límites prácticos.
Abre la dirección HTTPS de BPM Studio o localhost, no archivos file://.
Cancelar termina el Worker y su inferencia. Los recursos del modelo y runtime
se sirven desde el mismo proyecto, sin dependencias de CDN ni Hugging Face en ejecución.

Entrega batería, bajo, otros instrumentos y voces como WAV float32 estéreo,
44.1 kHz, con ondas reales y reproducción dentro del panel. No promete la misma
calidad que Mixed In Key ni que stemd Quality.

Fuentes:
- https://github.com/timcsy/demucs-web
- https://huggingface.co/timcsy/demucs-web-onnx
- https://onnxruntime.ai/docs/get-started/with-javascript/web.html

Licencias: LICENSE-demucs-web.txt y LICENSE-upstream.txt (ejemplo inicial
StemSplit/demucs-onnx del cual se adaptó la escritura WAV).

Prueba: `node stems-browser/test-audio.mjs` comprueba conservación exacta de
muestras float32, incluso picos por encima de 1, formato y duración WAV.

Prueba real en el navegador integrado de la Mac: el WAV sintético propio de
ocho segundos se separó con el modelo ONNX; se mostraron cuatro stems y sus
ondas. Los cuatro reproductores reportaron duración 8 s y readyState 4.
Esto verifica procesamiento real local; no verifica todos los móviles ni mide
calidad de separación sobre mezclas comerciales.

Corrección de memoria: cargar el modelo antes de decodificar el audio, emitir
WAV por bloques con solapamiento y liberar el Worker al terminar. Los cuatro
reproductores usan preload=none. El audio de entrada y los WAV almacenados
siguen creciendo con la duración. test-stream.cjs comprueba duración, estéreo
y continuidad entre bloques sin muestras perdidas ni repetidas.

Motor integrado: vendor/demucs (MIT), vendor/ort (MIT) y models/ (Demucs MIT).
El ONNX se divide en cuatro archivos menores de 50 MiB para almacenarlo en Git
sin Git LFS. manifest.json registra origen, tamaño y SHA-256; test-model.mjs
comprueba que las piezas reconstruyen exactamente el modelo original.

Al abrir el panel se precarga el modelo en CacheStorage. Elegir el archivo
inicia automáticamente la separación; el botón permite reintentar o repetir.
Si el navegador rechaza la caché por espacio/permisos, el motor puede cargar
las piezas directamente. La primera visita necesita transferir el modelo:
preparación automática no significa inferencia instantánea. El almacenamiento
puede ser borrado por el navegador. La separación no utiliza Render.
