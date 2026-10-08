# Stems gratuito en la nube

La pestaña Stems Studio usa por defecto un servicio público de Hugging Face,
integrado mediante iframe. Funciona sin el motor de la Mac ni contratar una GPU.

- Principal: TheStinger/UVR5_UI, con Roformer, Demucs y otros modelos.
- Alternativa: abidlabs/music-separation, Demucs con voz e instrumental.
- Opcional: stemd Quality local. Conserva el motor original solicitado; requiere
  la Mac activa y acceso local desde el navegador.

Los servicios públicos comparten GPU y aplican sus propias cuotas y colas.
No son una instancia dedicada nuestra. La separación gratuita en la nube usa
otros motores, no el binario stemd ni su promesa de reconstrucción.
Los archivos elegidos se envían al proveedor indicado en pantalla. La interfaz
del servicio permanece dentro de BPM Studio; no se redirige la página.

El diseño del contenedor se adapta a BPM Studio. Los controles interiores son
del servicio externo y no se pueden alterar por la política de mismo origen.
Si una opción no está disponible o agota cuota, cambiar de modelo no garantiza
recuperar cuota: los límites del proveedor se respetan.

Fuentes oficiales:
- https://huggingface.co/docs/hub/spaces-embed
- https://huggingface.co/docs/hub/spaces-zerogpu
- https://huggingface.co/spaces/TheStinger/UVR5_UI
- https://huggingface.co/spaces/abidlabs/music-separation

Verificado: ambos Spaces reportaron RUNNING, sus configuraciones respondieron
y el iframe UVR5 mostró sus controles de carga, modelos y separación dentro
de la página local. La calidad final depende del modelo y del archivo.

Prueba real: se subió el WAV sintético propio de ocho segundos al endpoint
público UVR5, se ejecutó `demucs_separator` con `htdemucs_ft.yaml` y salida WAV,
y el servicio respondió `event: complete` con archivos de stems. Esta prueba
confirma procesamiento gratuito real; no mide la separación de una mezcla
musical ni garantiza disponibilidad continua o cuota para pistas largas.
