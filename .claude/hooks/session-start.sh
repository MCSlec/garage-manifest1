#!/bin/bash
# ============================================================================
# Hook de démarrage des sessions Claude Code sur le web — Garage Manifest
# ----------------------------------------------------------------------------
# L'APP n'a aucune dépendance (CLAUDE.md §1.2) : rien n'est installé pour elle.
# Seuls les BANCS navigateur (banc-*.js, Playwright) ont besoin d'un outil :
# playwright-core, installé ici dans un dossier IGNORÉ par git
# (.claude/outils-bancs), jamais à la racine — pas de package.json à côté de
# l'app. Le navigateur, lui, est déjà fourni par l'environnement (/opt/pw-browsers).
#
# Idempotent : si la bonne version est déjà là, on ne réinstalle rien.
# ============================================================================
set -euo pipefail

# Uniquement dans les sessions cloud : en local, chacun gère son poste.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

RACINE="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
OUTILS="$RACINE/.claude/outils-bancs"
VERSION_PW="1.63.0"   # figée : une montée de version se décide, elle ne s'improvise pas

installee="$(node -p "try { require('$OUTILS/node_modules/playwright-core/package.json').version } catch (e) { '' }" 2>/dev/null || true)"
if [ "$installee" != "$VERSION_PW" ]; then
  mkdir -p "$OUTILS"
  # Pas de téléchargement de navigateur : l'environnement fournit Chromium.
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix "$OUTILS" --no-audit --no-fund --loglevel=error \
    "playwright-core@$VERSION_PW" >/dev/null
fi

# Chromium fourni par l'environnement : on prend le premier trouvé.
CHROME="$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1 || true)"

# Variables pour toute la session : les bancs lisent NODE_PATH et CHROMIUM.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export NODE_PATH=\"$OUTILS/node_modules\"" >> "$CLAUDE_ENV_FILE"
  [ -n "$CHROME" ] && echo "export CHROMIUM=\"$CHROME\"" >> "$CLAUDE_ENV_FILE"
fi

echo "Bancs prêts : playwright-core $VERSION_PW, Chromium ${CHROME:-introuvable}" >&2
