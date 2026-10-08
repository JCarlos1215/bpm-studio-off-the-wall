# Demucs en el dispositivo, sin cuota diaria de separación

Integra demucs-web 1.0.2 (MIT), ONNX Runtime Web 1.23.2 y HTDemucs ONNX para
navegadores. El modelo ocupa unos 172 MB y se descarga desde Hugging Face Hub;
no se utilizan Hugging Face Spaces ni GPU compartida. El audio permanece local.

La biblioteca realiza FFT, inferencia por segmentos y reconstrucción con
solapamiento dentro de un Worker. Se usa WebGPU cuando el Worker dispone de
un adaptador y WASM como alternativa. El modo WASM se limita a un hilo para
funcionar en GitHub Pages sin cabeceras COOP/COEP.

No hay contador de canciones, minutos o solicitudes de separación. La memoria,
velocidad y compatibilidad del navegador siguen imponiendo límites prácticos.
Abre la dirección HTTPS de BPM Studio o localhost, no archivos file://.
Cancelar termina el Worker y su inferencia. Los recursos del modelo y runtime
requieren conexión a sus proveedores y pueden sufrir errores de red.

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
