#!/usr/bin/env bash
set -euo pipefail
: "${STEMS_ACCESS_TOKEN:?Set a private access token of at least 32 characters}"
: "${STEMS_TRUSTED_HOSTS:?Set the actual HTTPS hostname and localhost,127.0.0.1}"
if (( ${#STEMS_ACCESS_TOKEN} < 32 )); then echo 'Access token is too short.' >&2; exit 1; fi
nvidia-smi >/dev/null
mkdir -p /workspace/data /workspace/cache /workspace/models
native_pid='' bridge_pid=''
cleanup(){ for pid in "$native_pid" "$bridge_pid"; do if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi; done; }
trap cleanup EXIT
trap 'exit 143' TERM INT
/usr/bin/stemd-server --headless --bind 127.0.0.1:8420 --no-mdns \
    --demucs-model bs_polarformer --full-precision --overlap 0.5 \
    --models /workspace/models --cache-dir /workspace/cache/stems \
    --cache-max-gb 4 --unfetched-ttl 900 --max-track-minutes 10 --queue-depth 2 &
native_pid=$!
ready=false
for ((attempt=0; attempt<600; attempt++)); do
    if ! kill -0 "$native_pid" 2>/dev/null; then echo 'stemd failed to start.' >&2; exit 1; fi
    if /opt/venv/bin/python -c 'import requests; h=requests.get("http://127.0.0.1:8420/v1/health",timeout=2).json(); assert h["device"]=="gpu" and h["preset"]=="Quality"' 2>/dev/null; then ready=true; break; fi
    sleep 1
done
if [[ "$ready" != true ]]; then echo 'Quality GPU engine did not become ready within 10 minutes.' >&2; exit 1; fi
/opt/venv/bin/python /app/bridge.py &
bridge_pid=$!
# Exit the container if either service fails; the hosting platform can restart it.
wait -n "$native_pid" "$bridge_pid"
exit 1
