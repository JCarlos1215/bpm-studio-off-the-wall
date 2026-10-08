# Servidor dedicado de Stems Studio

**Opción de pago descartada por el usuario.** La plataforma usa ahora servicios
gratuitos compartidos en `stems-separator/`. No contratar esta instancia; estos
archivos se conservan únicamente como referencia técnica para una futura petición.

Estado: código preparado y pruebas del adaptador ejecutables. El contenedor Linux
todavía requiere construirse y probarse en un servidor NVIDIA real. No existe
aún una instancia contratada ni una dirección remota configurada.

## Configuración propuesta

- Runpod Pod dedicado, RTX A5000, 24 GB VRAM; al menos 16 GB RAM y 4 CPU.
- Linux x86-64, controlador NVIDIA 580 o posterior; CUDA 13.3 y cuDNN 9.5+.
- Volumen persistente de 20 GB montado en `/workspace`.
- Puerto HTTP público **8421 exclusivamente**. HTTPS mediante el proxy Runpod.
- stemd 0.1.2 oficial, SHA-256 verificado; Quality, float32, overlap 0.5.
- El motor 8420 escucha solamente en loopback. Nunca publicarlo.
- Una clave privada de al menos 32 caracteres. Es acceso personal compartido;
  no es un sistema de cuentas multiusuario. Las personas con la clave comparten
  acceso a los trabajos. No distribuirla públicamente.
- Dos trabajos en cola, pistas hasta diez minutos, caché limitada a 4 GB.
  Subida remota hasta 99 MB para respetar los límites habituales del proxy.

## Imagen y despliegue

El workflow manual de ejemplo `deploy/build-stems-server.yml` construye y publica
la imagen en `ghcr.io/jcarlos1215/bpm-studio-off-the-wall-stems:latest` una vez
activado en `.github/workflows/` con credenciales que tengan permiso `workflow`.
La credencial GitHub actual rechazó crear workflows; por eso el archivo se
conserva como configuración preparada y no se ha construido la imagen en Actions.
Verificar la ejecución antes de usarla. Si el paquete es privado, configurar credenciales de lectura del
registro en Runpod; alternativamente publicar el paquete desde GitHub. Nunca usar
la clave de acceso de Stems Studio como credencial del registro.

Desde la raíz del repositorio, en una máquina con Docker:

```sh
docker build --platform linux/amd64 -t YOUR_REGISTRY/bpm-stems:0.1.2 -f stems-studio/Dockerfile stems-studio
docker push YOUR_REGISTRY/bpm-stems:0.1.2
```

Crear el Pod con esa imagen. El registro debe ser tuyo; `YOUR_REGISTRY` es un
marcador que hay que sustituir, no un registro ya creado. Establecer las variables
en el panel privado del proveedor:

| Variable | Valor |
| --- | --- |
| `STEMS_ACCESS_TOKEN` | clave aleatoria privada de 32+ caracteres |
| `STEMS_TRUSTED_HOSTS` | `POD_ID-8421.proxy.runpod.net,localhost,127.0.0.1` |
| `STEMS_ALLOWED_ORIGINS` | `https://POD_ID-8421.proxy.runpod.net` |

La imagen ya establece `HOST=0.0.0.0`, `PORT=8421` y `STEMS_REMOTE=true`.
No introducir la clave en GitHub ni en `server-config.js`.
La primera carga descarga los modelos. El contenedor espera hasta diez minutos
y exige `GPU` y `Quality`; un fallo detiene los dos procesos.

Antes de activar la página:

1. Revisar los logs: modelo Quality cargado, GPU disponible, adaptador listo.
2. Comprobar `https://POD_ID-8421.proxy.runpod.net/ready` devuelve `ready: true`.
3. Abrir el iframe servido por esa dirección, introducir la clave y separar una
   pista propia corta. Verificar los tres WAV y sus formas de onda.
4. Comprobar que `/api/health` sin clave responde 401 y que 8420 no es público.
5. Poner la dirección HTTPS real en `stems-studio/server-config.js`, subirla a
   `main` y comprobar el flujo completo desde GitHub Pages en móvil y escritorio.

El iframe y su API se sirven desde el mismo servidor; no necesitan acceso a la
red local ni cookies de terceros. Las descargas llevan una firma temporal de
una hora, limitada a cada archivo, para que el reproductor del navegador pueda
acceder sin exponer la clave principal. Las ondas se calculan en el servidor;
el móvil no mantiene tres pistas completas decodificadas en memoria.

Las pistas se decodifican con FFmpeg a estéreo 44.1 kHz float32 antes de separar.
Los WAV finales contienen las muestras float32 del motor sin recodificación.
La reconstrucción se refiere a esa señal de entrada procesada, no a igualdad
binaria con un MP3 original. El navegador puede tener diferencias de soporte
para reproducir WAV float32; las descargas siguen disponibles.

## Coste y aprobación pendiente

Tarifa publicada de RTX A5000 consultada el 7 de octubre de 2026:
USD 0.27/h, equivalente a USD 194.40 por 720 horas. Almacenamiento e impuestos
aparte; disponibilidad y precio final se verifican en el momento de contratar.
El servidor debe permanecer encendido para acceso continuo desde cualquier
dispositivo. Detenerlo reduce cómputo facturado pero deja el servicio sin acceso;
el almacenamiento persistente puede continuar generando cargos.

Fuentes oficiales:
- https://www.runpod.io/pricing
- https://docs.runpod.io/pods/configuration/expose-ports
- https://github.com/nsaintot/stemd/blob/main/docs/building.md

Falta autorización del gasto y acceso a una cuenta Runpod o a un servidor GPU
existente. Este despliegue habilita separación de archivos de audio; no elimina
límites de YouTube ni proporciona descargas de audio de la API de Spotify.

## Verificación realizada

- 11 pruebas del adaptador: autenticación remota, firmas restringidas al archivo
  y caducidad, ondas calculadas a partir del PCM real incluso con fragmentos
  incompletos, decodificación real de WAV con FFmpeg y salida float32 intacta.
- Sintaxis JavaScript, script de arranque y revisión del diff sin errores.
- La prueba de integración adicional contra el motor real de la Mac confirmó
  GPU/Quality y aceptó la subida (202), pero alcanzó 120 segundos esperando un
  trabajo detrás de otra separación activa. Ese intento no verifica la entrega
  final remota. No se interrumpió la separación que ya estaba en curso.
- La imagen Linux y el acceso desde móvil requieren validación después de
  construir y activar el servidor. GitHub Pages publicó el código preparado.
