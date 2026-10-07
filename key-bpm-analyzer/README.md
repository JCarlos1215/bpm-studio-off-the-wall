# Analizador DJ local

Módulo web autónomo integrado en BPM Studio mediante un iframe. Usa Web Audio y
JavaScript del navegador; no carga bibliotecas, modelos, servicios ni recursos remotos.
El archivo de audio se lee y analiza en el dispositivo y no se transmite a un servidor.

## Funciones

- Estima tonalidad mayor o menor y muestra su equivalente Camelot mediante perfiles de
  chroma calculados con FFT; si la evidencia es insuficiente, muestra una tonalidad no concluyente.
- Estima BPM por autocorrelación del envolvente de ataques.
- Mide el nivel RMS del audio en una escala de 0 a 100: −60 dBFS equivale a 0 y 0 dBFS a 100. No representa la energía musical ni una medición LUFS.
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

### Verificación del análisis

Ejecuta `node tests/audio-analysis.mjs` desde la raíz. Las pruebas utilizan pulsos
de tempo conocido con subdivisiones agudas, silencio, tonos constantes y estéreo
con fase opuesta. Ambos detectores comparten el estimador de periodicidad, de
60 a 200 BPM, con ventanas de hasta 16 segundos y énfasis en el pulso grave.
Los archivos combinan tres ventanas distribuidas en la pista. Las pruebas sintéticas
no garantizan precisión en todas las canciones: síncopas, cambios de tempo y ritmos
sin pulso grave pueden producir ambigüedad, incluido medio o doble tempo.
