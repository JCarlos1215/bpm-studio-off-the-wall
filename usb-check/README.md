# USB Check

Panel independiente dentro de un iframe de BPM, inspirado visualmente en la
captura aportada por el usuario. No es Transcrate ni usa su código o marca.

## Funciones

- Abrir una carpeta de solo lectura con File System Access cuando esté disponible,
  seleccionar una carpeta mediante webkitdirectory, o elegir archivos individuales.
- Conservar varias selecciones durante la sesión, cambiar entre ellas y volver a
  revisar. Quitar una selección solo retira su entrada de la interfaz.
- Seleccionar manualmente FAT16/FAT32/exFAT/HFS+/NTFS/APFS y comparar diez perfiles.
- Capacidad y espacio libre opcionales, introducidos por el usuario y validados.
- Inventario de tamaños y extensiones, archivos vacíos y archivos demasiado grandes
  para FAT32. Los formatos OGG/Opus/WMA se señalan para revisión, no se declaran
  incompatibles universalmente mediante una suposición sobre todos los equipos.
- Lectura de hasta 64 KiB por WAV para identificar fmt, PCM/float, canales, bits y
  frecuencia. PCM 16/24 con 44,1/48 kHz y uno/dos canales no genera avisos de
  cabecera; eso NO significa que el archivo completo se haya reproducido/validado.
- Detección por ruta de PIONEER/rekordbox/export.pdb, exportLibrary.db y archivos
  DAT/EXT/2EX en PIONEER/USBANLZ. No parsea índices ni certifica OneLibrary, rutas
  de tracks, cues, integridad de bases de datos o compatibilidad de bibliotecas.
- Cancelación con resultados parciales e informe JSON; filtro de avisos y hasta
  200 filas visibles. El informe incluye todos los archivos revisados.
- Demo explícita con datos simulados; no enumera ni detecta unidades reales.
- Botón Convertir audio: navega al convertidor ya existente en BPM mediante un
  mensaje validado por origen y ventana de iframe. No escribe en el USB.

## Matriz y fuentes

Los diez perfiles cubren SOLO el formato del sistema de archivos indicado por el
usuario: CDJ-3000X, CDJ-3000, CDJ-2000NXS2, XDJ-AZ, XDJ-AN, XDJ-XZ, XDJ-RX3,
XDJ-RR, OMNIS-DUO y OPUS-QUAD. Cada tarjeta enlaza la documentación del fabricante.
Fuentes revisadas el 21 de octubre de 2026, enlaces en `profiles.js`.

La documentación actual de XDJ-XZ incluye exFAT; la matriz no replica el resultado
rojo de ese modelo en la captura. Para exFAT, ocho de estos diez perfiles figuran
como admitidos; CDJ-2000NXS2 y XDJ-RR no lo incluyen en sus formatos compatibles.
El usuario debe comprobar el firmware y el manual de su unidad concreta.

Un recuadro verde significa formato documentado, no prueba física. La herramienta
no certifica que un reproductor lea esa unidad. Para actualizar firmware los
formatos requeridos pueden ser distintos. Las restricciones de particiones,
energía USB, cables, corrupción, tipo de biblioteca y códecs requieren comprobación
adicional. No se conecta a los reproductores DJ ni prueba la lectura real en ellos.

## Límites del navegador y privacidad

No se obtiene automáticamente el formato real FAT32/exFAT, la tabla de particiones,
la ruta física del volumen, capacidad o espacio libre. StorageManager.estimate no
se utiliza porque informa el almacenamiento del origen web, no el del USB.

No se enumeran unidades montadas. El selector del sistema da acceso únicamente a
lo que el usuario elige. Una carpeta anidada o una selección de archivos no
representa necesariamente toda la unidad. En iPhone la selección de carpetas
puede no estar disponible; el selector de archivos funciona como revisión parcial
de esos archivos. No se ha probado un USB físico en un iPhone real.

Sin red para analizar archivos, sin subidas, sin formato ni escritura de unidades.
No pide permisos de escritura ni usa WebUSB para intentar acceder a discos. La
lectura es local; solo se escribe el informe descargado por decisión del usuario.
Los permisos, selecciones y contenido no se guardan en localStorage ni se suben.

Se revisan como máximo 20.000 archivos y 10.000 directorios por selección; al
alcanzar límites o cancelar se indica que el resultado es parcial. Los archivos
no se cargan completos en memoria. Se lee únicamente la cabecera de los WAV; las
otras extensiones se contabilizan sin confirmar códec ni contenido completo.

## Pruebas

`node tests/usb-check.mjs`: reglas, fuentes de compatibilidad conocidas, formato
sin confirmar, NTFS, exFAT, cabecera WAV, límite FAT32, rutas de biblioteca,
cancelación y límite de archivos.

Con `python serve_project.py --port 8080`, `python tests/usb-check.py`: iframe
perezoso, selección de carpeta, WAV real PCM/float, matriz, bibliotecas, campos
manuales, informe JSON, demo, navegación al convertidor, cancelación y vista móvil.
Los tests crean fixtures sintéticos; no validan unidades o reproductores físicos.
