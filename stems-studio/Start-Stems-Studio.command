#!/bin/zsh
set -eu
stem_project_dir="${0:A:h:h}"
cd "$stem_project_dir"
stem_python="$stem_project_dir/off-the-wall-mp3-studio/.venv/bin/python"
stem_app="/Applications/Stemd.app/Contents/MacOS/stemd"
mkdir -p "$stem_project_dir/work/stems"
if [[ ! -x "$stem_python" || ! -x "$stem_app" ]]; then
  print 'Falta stemd o el entorno Python del proyecto. Consulta stems-studio/README.md.'
  exit 1
fi
typeset -a stem_owned_pids
stem_owned_pids=()
function stem_cleanup() { for stem_pid in "${stem_owned_pids[@]}"; do kill "$stem_pid" 2>/dev/null || true; done; }
trap stem_cleanup EXIT
if ! curl -fsS --max-time 2 http://127.0.0.1:8080/ >/dev/null; then
  "$stem_python" -m http.server 8080 --bind 127.0.0.1 > "$stem_project_dir/work/stems/http.log" 2>&1 &
  stem_owned_pids+=($!)
fi
if ! curl -fsS --max-time 2 http://127.0.0.1:8420/v1/health >/dev/null; then
  "$stem_app" --headless --bind 127.0.0.1:8420 --no-mdns \
    --models "$HOME/Library/Application Support/stemd/models" \
    --demucs-model bs_polarformer --full-precision --overlap 0.5 \
    --cache-dir "$stem_project_dir/work/stems/cache" > "$stem_project_dir/work/stems/stemd.log" 2>&1 &
  stem_owned_pids+=($!)
fi
print 'Motor local activo. Mantén esta ventana abierta y entra a Stems Studio en BPM Studio.'
if curl -fsS --max-time 2 http://127.0.0.1:8421/api/health >/dev/null; then
  print 'El adaptador ya estaba activo. Usa la ventana que lo inició.'
  exit 0
fi
"$stem_python" "$stem_project_dir/stems-studio/bridge.py"
