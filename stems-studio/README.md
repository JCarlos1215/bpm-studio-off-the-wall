# Stems Studio, integrado en BPM Studio

La pestaña **Stems Studio** carga `stems-studio/index.html` en un iframe del mismo sitio. No redirige al usuario al programa de escritorio ni al repositorio.

El separador es **stemd**, no un filtro ni una separación simulada. Se utiliza su API v1 y se solicita `include_derived=true` para obtener **vocals**, **drums** y **harmonics**. El perfil Quality combina BS PolarFormer y htdemucs_ft; el iniciador usa precisión completa y solapamiento 0.5. Esto no garantiza aislamiento perfecto ni separa el bajo como una cuarta pista independiente.

## Activar en este Mac

1. Abre `Start-Stems-Studio.command` con doble clic.
2. Deja esa ventana abierta.
3. Entra a BPM Studio y selecciona **Stems Studio**.
4. Elige tu archivo y pulsa **Separar stems**. Escucha o descarga los tres WAV dentro de la página.

El Mac tiene stemd en `/Applications/Stemd.app` y los modelos en `~/Library/Application Support/stemd/models`. El iniciador usa el entorno Python de `off-the-wall-mp3-studio/.venv` (Flask, requests, waitress). Si clonaste en otro equipo, crea ese entorno e instala `off-the-wall-mp3-studio/requirements.txt`.

El motor escucha únicamente en `127.0.0.1:8420`; el adaptador web en `127.0.0.1:8421`. No se publica el motor en la red. Si el navegador pide permiso para conectar con el motor local, el usuario puede concederlo para este sitio. No se desactiva la protección del navegador. Chrome reciente requiere permiso de conexión local; la interfaz declara `targetAddressSpace: loopback` y delega ese permiso al iframe. Safari y algunos navegadores integrados pueden bloquear HTTPS → localhost. El iniciador también sirve la misma página en `http://127.0.0.1:8080` para usar el iframe localmente en ese caso, sin redirigir a un servicio externo.

## Audio y precisión

El navegador decodifica y remuestrea una sola vez a PCM estéreo float32 / 44.1 kHz. El adaptador solicita salida `pcm32` y añade una cabecera WAV IEEE float sin convertir ni recortar las muestras. Evita compresión con pérdida y el cambio de ganancia de formatos enteros. Se validan `gain == 1`, formato, canales y frecuencia; nunca se usan rutas de disco devueltas por el servidor. Los tres archivos tienen el mismo número de fotogramas.

Límite de interfaz: 200 MB / 10 minutos. Calidad depende de la mezcla, fuente y modelo. La conversión de frecuencia de la fuente puede alterar ligeramente la señal; no se promete reconstrucción bit a bit de un archivo comprimido original. La prueba de reconstrucción utiliza el PCM realmente enviado al motor.

## Publicación y límites

La interfaz se publica con GitHub Pages y puede llamar al motor de **la misma Mac desde la que se abre la página**. En un teléfono o en otro equipo, `127.0.0.1` se refiere a ese dispositivo: no se conecta al Mac automáticamente.

El Render gratuito actual no aloja stemd. La documentación del motor indica unos 1.8 GB de memoria más unos 155 MB por minuto de audio; no cabe en ese servicio. Procesar para todos los visitantes requiere un servidor separado con memoria/GPU, HTTPS, autenticación y límites de carga. No se creó un servicio de pago ni se expuso esta Mac a internet.

## Pruebas

Desde la raíz: `off-the-wall-mp3-studio/.venv/bin/python -m pytest -q stems-studio/test_bridge.py`.

Referencia: https://github.com/nsaintot/stemd · contrato: https://github.com/nsaintot/stemd/blob/main/docs/api.md

El código del adaptador y la interfaz es propio; usa el programa instalado mediante HTTP. No se redistribuyen el binario ni los pesos de modelos de terceros.
# Servidor dedicado

La adaptación para un servidor GPU remoto está en [deploy/README.md](deploy/README.md).
Incluye contenedor Linux, autenticación, subida con decodificación en el servidor,
ondas calculadas en el servidor y conexión HTTPS dentro del mismo iframe.
La contratación y la comprobación en una GPU Linux están pendientes.
`server-config.js` conserva la dirección remota vacía hasta que exista el servidor.
