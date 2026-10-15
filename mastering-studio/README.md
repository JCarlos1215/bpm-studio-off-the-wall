# Mastering Studio

Herramienta independiente en el iframe Mastering Studio de BPM, inspirada en la
consola y categorías de procesadores de https://mastering.jeane.asia. No copia el
código, marca, logotipo, presets numéricos ni recursos de esa página. No es una
integración oficial de JEANE ni garantiza resultados idénticos a su motor.

## Herramientas funcionales

- Entrada, filtro DC, paso alto, graves, presencia y aire.
- Cinco EQ paramétricos (frecuencia, ganancia y Q).
- Compresor de bus con ataque/release y compresión de cinco bandas.
- De-harsh: compresión de la banda alta tras un cruce ajustable.
- Saturación suave con sobremuestreo 2× y cuatro colores tonales mediante filtros.
  Los colores no modelan físicamente convertidores AD/DA ni equipos analógicos.
- Anchura estéreo, ganancias Mid/Side y escucha en mono. La anchura cero genera
  mono; los ajustes de escucha no alteran el master exportado.
- Limitador con release, salida y normalización integrada de −20 a −8 LUFS.
- Perfiles propios para streaming, DJ, intenso, voz, pop, hip-hop, rock y acústico,
  además de un punto de partida natural.
- Original/master con formas de onda y posicionamiento, A/B al mismo tiempo y
  compensación de volumen basada en LUFS. La reproducción se pausa al salir del tab.
- Espectro y goniómetro en reproducción, con correlación estéreo instantánea.
- Referencia: análisis LUFS/true peak, reproducción y adopción de objetivo de
  loudness; no implementa copia automática de EQ ni timbre de referencia.
- Ajustes JSON, historial de hasta diez ajustes en localStorage y borrado manual.
- Lotes de diez pistas en secuencia con ZIP e informe; los errores individuales
  no descartan los archivos correctos. Cancelar conserva los ya procesados.

## Motor y precisión

El motor FFmpeg WASM ya incluido en BPM realiza el DSP. No usa APIs remotas ni
sube el audio. Los cruces multibanda son filtros de 24 dB/octava; pueden afectar
fase y timbre, por lo que los módulos multibanda/de-harsh se pueden desactivar.

LUFS integrados, true peak sobremuestreado y rango se obtienen analizando todo el
archivo con FFmpeg loudnorm (EBU R128/BS.1770). No son mediciones momentáneas en
vivo. La exportación se vuelve a medir después de cambiar frecuencia y formato;
con el limitador activado se atenúa si hace falta para cumplir el techo. El
objetivo LUFS puede no alcanzarse cuando el techo/dinámica lo impiden. Sin
limitador el usuario puede exportar un archivo con picos por encima del techo.

El asistente es heurístico y emplea las mediciones; no es un servicio de IA ni
clasifica géneros automáticamente. Los perfiles aplican ajustes propios. El
procesamiento es offline: tras cambiar ajustes hay que crear otro master para
escuchar su resultado. No se anuncia una cadena de efectos ajustable en vivo.

## Formatos y límites

WAV PCM 16/24 bits y FLAC 16/24 bits, 44,1/48 kHz. Se eliminan metadatos en la
exportación. No se aplica dithering dedicado de mastering; elegir 24 bits para
conservar margen de cuantización en trabajo posterior.

Archivo individual de hasta 60 MB y diez minutos. Lote de hasta 150 MB de entrada
y 150 MB de archivos resultantes. Solo se procesa una pista a la vez. El volumen
WASM, los originales y las copias temporales requieren memoria: los límites de
archivo no garantizan que una pista larga funcione en todos los iPhone. Se puede
cancelar terminando el worker y volver a cargarlo. No se guardan audios en el
historial; se liberan los temporales al cerrar la página. Mantener la pestaña
abierta durante el proceso.

Compatibilidad de importación por FFmpeg; la reproducción original depende de los
codecs del navegador. Para escuchar una fuente no admitida por el reproductor,
exportar primero a WAV o FLAC. No se ha realizado una prueba en un iPhone físico.

## Verificación

`python tests/mastering-studio.py`, con `python serve_project.py --port 8080`.
Procesa audio sintético con el motor WASM real, activa los módulos, exporta FLAC16
48 kHz, comprueba mono y duración, mide el archivo con FFmpeg nativo, prueba
referencia, sesión JSON, A/B, pausa al cambiar de tab, cancelación, ZIP real y
layout móvil. No envía canciones a servicios externos.
