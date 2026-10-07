# Analizador DJ local

Módulo web autónomo integrado en BPM Studio mediante un iframe. Usa Web Audio y
JavaScript del navegador; no carga bibliotecas, modelos, servicios ni recursos remotos.
El archivo de audio se lee y analiza en el dispositivo y no se transmite a un servidor.

## Funciones

- Estima tonalidad mayor o menor y muestra su equivalente Camelot mediante perfiles de
  chroma calculados con FFT.
- Estima BPM por autocorrelación del envolvente de ataques.
- Resume la intensidad como un valor relativo de 0 a 100 para comparar dentro de la pista.
- Sugiere puntos orientativos de inicio, pico de energía, posible breakdown y salida.
- Exporta los tiempos sugeridos como CSV.

Las estimaciones dependen del audio y del navegador. Escucha y ajusta los resultados antes
de usarlos. Los Hot Cues son referencias para preparar una mezcla: este módulo no los
escribe en rekordbox ni modifica la USB. El límite por pista es 150 MB y 20 minutos; los
formatos dependen de los decodificadores disponibles en el navegador.

Desde la carpeta principal del proyecto, inicia `Iniciar BPM Studio.command` y elige
**Tonalidad y energía**. El iframe y todos los archivos del módulo se sirven desde
`127.0.0.1`; la interfaz y el análisis no necesitan Internet.

En iPhone, guarda el audio en la app **Archivos** y selecciónalo desde el analizador.
El selector no filtra por tipo MIME para evitar que iOS deshabilite audios identificados
como archivos genéricos. El navegador valida el contenido al decodificarlo; si el formato
no es compatible, muestra un mensaje con alternativas (MP3, WAV o M4A sin protección).
