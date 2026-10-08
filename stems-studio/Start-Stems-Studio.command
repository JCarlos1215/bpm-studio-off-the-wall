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
if ! curl -fsS --max-time 2 http://127.0.0.1:8420/v1/health >/dev/null; then
  "$stem_app" --headless --bind 127.0.0.1:8420 --no-mdns \
    --models "$HOME/Library/Application Support/stemd/models" \
    --demucs-model bs_polarformer --full-precision --overlap 0.5 \
    --cache-dir "$stem_project_dir/work/stems/cache" > "$stem_project_dir/work/stems/stemd.log" 2>&1 &
  stem_process_id=$!
  trap 'kill "$stem_process_id" 2>/dev/null || true' EXIT
fi
print 'Motor local activo. Mantén esta ventana abierta y entra a Stems Studio en BPM Studio.'
"$stem_python" "$stem_project_dir/stems-studio/bridge.py"
