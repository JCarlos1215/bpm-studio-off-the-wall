#!/bin/zsh
set -e
cd "$(dirname "$0")"

host=127.0.0.1
port=8080
url="http://$host:$port/"
mp3_host=127.0.0.1
mp3_port=8093
mp3_url="http://$mp3_host:$mp3_port/"
mp3_dir="$PWD/off-the-wall-mp3-studio"
mp3_python="$mp3_dir/.venv/bin/python"
main_pid=
mp3_pid=

stop_servers() {
  for server_pid in "$main_pid" "$mp3_pid"; do
    if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
      kill "$server_pid" 2>/dev/null || true
    fi
  done
}
trap stop_servers EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for port_to_check in "$port" "$mp3_port"; do
  if lsof -nP -iTCP:"$port_to_check" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "El puerto $port_to_check ya está en uso. Cierra el servidor que lo ocupa y vuelve a intentarlo."
    read -r "?Pulsa Enter para cerrar esta ventana. "
    exit 1
  fi
done

if [[ ! -x "$mp3_python" ]]; then
  echo "Falta el entorno local de Python de MP3 Studio: $mp3_dir/.venv"
  echo "Inicia off-the-wall-mp3-studio/Iniciar.command una vez con conexión para instalarlo."
  read -r "?Pulsa Enter para cerrar esta ventana. "
  exit 1
fi

(
  cd "$mp3_dir"
  exec env HOST="$mp3_host" PORT="$mp3_port" \
    MP3_STUDIO_FRAME_ANCESTORS="'self' http://127.0.0.1:8080 http://localhost:8080" \
    "$mp3_python" app.py
) &
mp3_pid=$!

mp3_ready=0
for attempt in {1..40}; do
  if curl --fail --silent --output /dev/null "$mp3_url/api/status"; then
    mp3_ready=1
    break
  fi
  if ! kill -0 "$mp3_pid" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

if [[ "$mp3_ready" != 1 ]]; then
  echo "No se pudo iniciar MP3 Studio en $mp3_url."
  echo "Revisa los mensajes anteriores de esta ventana para ver el error del servidor."
  read -r "?Pulsa Enter para cerrar esta ventana. "
  exit 1
fi

python3 serve_project.py --host "$host" --port "$port" &
main_pid=$!

main_ready=0
for attempt in {1..40}; do
  if curl --fail --silent --output /dev/null "$url"; then
    main_ready=1
    break
  fi
  if ! kill -0 "$main_pid" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

if [[ "$main_ready" != 1 ]]; then
  echo "No se pudo iniciar BPM Studio en $url."
  read -r "?Pulsa Enter para cerrar esta ventana. "
  exit 1
fi

open "$url"
echo "BPM Studio, Rekordbox Explorer y la interfaz de MP3 Studio se sirven localmente."
echo "La interfaz está en $url; MP3 Studio está en $mp3_url."
echo "Mantén esta ventana abierta. Ciérrala para detener los servidores locales."
wait "$main_pid"
