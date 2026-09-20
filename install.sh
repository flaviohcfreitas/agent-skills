#!/usr/bin/env bash
# Liga a pasta canônica de skills aos agentes instalados na máquina. Idempotente.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANON="$REPO/skills"

# 1. ~/.agents/skills -> skills/  (lido por Codex, app do ChatGPT, Cursor e outros)
mkdir -p ~/.agents
if [ -L ~/.agents/skills ]; then
  ln -sfn "$CANON" ~/.agents/skills
elif [ -d ~/.agents/skills ]; then
  # já existe uma pasta real: move o que houver para a canônica e substitui por symlink
  for d in ~/.agents/skills/*/; do
    [ -d "$d" ] || continue
    n=$(basename "$d")
    [ -e "$CANON/$n" ] || mv "$d" "$CANON/$n"
  done
  rm -rf ~/.agents/skills
  ln -s "$CANON" ~/.agents/skills
else
  ln -s "$CANON" ~/.agents/skills
fi
echo "~/.agents/skills -> $CANON"

# 2. ~/.claude/skills/<skill> -> ~/.agents/skills/<skill>  (Claude Code)
mkdir -p ~/.claude/skills
for d in "$CANON"/*/; do
  n=$(basename "$d")
  [ -f "$d/SKILL.md" ] || continue
  t=~/.claude/skills/$n
  if [ -L "$t" ]; then
    ln -sfn "../../.agents/skills/$n" "$t"
  elif [ -e "$t" ]; then
    echo "  skip $n: ~/.claude/skills/$n já existe como pasta real"
  else
    ln -s "../../.agents/skills/$n" "$t"
  fi
done
echo "~/.claude/skills/* linkados"

# 3. remove links quebrados deixados por skills removidas
find ~/.claude/skills -maxdepth 1 -type l ! -exec test -e {} \; -print -delete 2>/dev/null | sed 's/^/  removido link quebrado: /' || true
echo "ok"
