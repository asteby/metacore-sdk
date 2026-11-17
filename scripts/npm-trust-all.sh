#!/usr/bin/env bash
# Configura UNA SOLA VEZ la publicacion confiable (OIDC / Trusted Publishing) de
# todos los paquetes publicos del SDK en npm. Accion de cuenta: la hace el dueno
# del scope con su propia sesion npm y su 2FA; el CI no puede hacerlo.
#
# Que habilita, por paquete (ver `npm trust github --help`, npm >= 11.10):
#   --allow-publish         `npm publish` desde release-npm.yml por OIDC (sin token
#                           ni aprobacion humana: el release queda automatico).
#   --allow-stage-publish   `npm stage publish` desde el mismo workflow por OIDC.
#
# Requisitos: npm >= 11.10, `npm login` hecho, y que los paquetes ya existan en
# npm (un paquete nuevo necesita una primera version aprobada/publicada a mano).
# Cada llamada puede pedir tu codigo 2FA.
#
# Uso:  bash scripts/npm-trust-all.sh           aplica
#       DRY=1 bash scripts/npm-trust-all.sh     solo muestra los comandos
#       npm trust list @asteby/<pkg>            para verificar uno
set -u
REPO="asteby/metacore-sdk"
FILE="release-npm.yml"   # debe coincidir EXACTO con el nombre del workflow
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Paquetes publicos del workspace (name de cada package.json no privado).
mapfile -t PKGS < <(node -e '
const fs=require("fs"),path=require("path");
const dir=process.argv[1];
for (const d of fs.readdirSync(dir)) {
  const f=path.join(dir,d,"package.json");
  if (!fs.existsSync(f)) continue;
  const j=JSON.parse(fs.readFileSync(f,"utf8"));
  if (!j.private && j.name) console.log(j.name);
}' "$ROOT/packages")

ok=0; fail=0
for p in "${PKGS[@]}"; do
  echo "==> $p"
  cmd=(npm trust github "$p" --repo "$REPO" --file "$FILE" --allow-publish --allow-stage-publish -y)
  if [ "${DRY:-0}" = "1" ]; then echo "${cmd[*]}"; continue; fi
  if "${cmd[@]}"; then ok=$((ok+1)); else fail=$((fail+1)); echo "!! fallo en $p (revisa el mensaje; puede estar ya configurado o no existir aun)"; fi
done
echo "listo: $ok configurados, $fail con aviso"
[ "$fail" -eq 0 ]
