#!/usr/bin/env bash
# HM-PF-49: start Docker, then Community n8n. Cursor runs this from `start`
# on each agent boot. Do not call it from `install` (n8n is long-running).
set -euo pipefail

resolve_root() {
  local candidate
  for candidate in \
    "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" \
    "/agent/repos/fight-motion-kit" \
    "$(pwd)"
  do
    if [ -n "${candidate}" ] && [ -f "${candidate}/ops/n8n/docker-compose.yml" ]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  return 1
}

if ! ROOT="$(resolve_root)"; then
  echo "ops/n8n/docker-compose.yml not found" >&2
  exit 1
fi

cd "${ROOT}/ops/n8n"

# `service docker start` exits 1 when the daemon is already up.
if ! sudo service docker start; then
  sudo docker info >/dev/null
fi

# .env is gitignored. Prefer a file already on disk so a boot cannot rotate
# the key out from under the hm_pf49_n8n_data volume. Cursor Secret
# N8N_ENCRYPTION_KEY is only used to create the file the first time.
if [ ! -f .env ]; then
  if [ -z "${N8N_ENCRYPTION_KEY:-}" ]; then
    echo "ops/n8n/.env is missing and N8N_ENCRYPTION_KEY is unset." >&2
    echo "Copy .env.example to .env, or store N8N_ENCRYPTION_KEY in Cursor Secrets." >&2
    exit 1
  fi
  umask 077
  python3 - <<'PY'
import os
import pathlib

src = pathlib.Path(".env.example").read_text()
placeholder = "REPLACE_WITH_OPENSSL_RAND_HEX_32"
if placeholder not in src:
    raise SystemExit(".env.example is missing the encryption-key placeholder")
key = os.environ["N8N_ENCRYPTION_KEY"]
if len(key) < 32:
    raise SystemExit("N8N_ENCRYPTION_KEY must be at least 32 characters")
path = pathlib.Path(".env")
path.write_text(src.replace(placeholder, key, 1))
os.chmod(path, 0o600)
PY
fi

mkdir -p local-files
sudo docker compose up -d

ok=0
for _ in $(seq 1 90); do
  if curl -fsS --max-time 2 http://127.0.0.1:5678/healthz >/tmp/n8n-healthz.txt 2>/dev/null; then
    ok=1
    break
  fi
  sleep 2
done

if [ "${ok}" != 1 ]; then
  echo "n8n /healthz was not ready" >&2
  sudo docker compose ps || true
  sudo docker compose logs --tail 80 || true
  exit 1
fi

echo "n8n healthz ok"
cat /tmp/n8n-healthz.txt
echo
