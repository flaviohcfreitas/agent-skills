#!/usr/bin/env bash
# Skills compartilhadas e exclusivas por agente; nunca substitui conteúdo existente.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Destino alternativo para instalação portátil e verificação isolada.
TARGET_HOME="${AGENT_SKILLS_HOME:-$HOME}"

link_skill() {
  local source="$1" target="$2"
  if [ -L "$target" ] || [ -e "$target" ]; then
    if [ -L "$target" ] && [ -d "$target" ] && [ "$(cd "$target" && pwd -P)" = "$(cd "$source" && pwd -P)" ]; then
      return
    fi
    echo "Conflito: $target já existe; preservado." >&2
    return 1
  fi
  mkdir -p "$(dirname "$target")"
  ln -s "$source" "$target"
  echo "$target -> $source"
}

# Mantém o link global existente; em instalação com pasta real, adiciona links
# individuais sem mover nem apagar skills do usuário.
if [ ! -e "$TARGET_HOME/.agents/skills" ] && [ ! -L "$TARGET_HOME/.agents/skills" ]; then
  mkdir -p "$TARGET_HOME/.agents"
  ln -s "$REPO/skills" "$TARGET_HOME/.agents/skills"
elif [ -L "$TARGET_HOME/.agents/skills" ]; then
  link_skill "$REPO/skills" "$TARGET_HOME/.agents/skills"
else
  for skill in "$REPO"/skills/*/; do
    [ -f "$skill/SKILL.md" ] || continue
    link_skill "${skill%/}" "$TARGET_HOME/.agents/skills/$(basename "$skill")"
  done
fi

for skill in "$REPO"/skills/*/; do
  [ -f "$skill/SKILL.md" ] || continue
  target="$TARGET_HOME/.claude/skills/$(basename "$skill")"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "Preservada skill local: $target"
    continue
  fi
  link_skill "${skill%/}" "$target"
done

# Estas pastas ficam FORA de skills/, que é descoberta por vários agentes.
for agent in codex claude cursor; do
  for skill in "$REPO/$agent/skills"/*/; do
    [ -f "$skill/SKILL.md" ] || continue
    name="$(basename "$skill")"
    if [ -e "$REPO/skills/$name" ]; then
      echo "Conflito: $name existe como compartilhada e exclusiva de $agent." >&2
      exit 1
    fi
    link_skill "${skill%/}" "$TARGET_HOME/.$agent/skills/$name"
  done
done
# Decision Gate é compartilhada pelos três harnesses a partir de .agents/skills.
for agent in codex cursor; do
  link_skill "$TARGET_HOME/.agents/skills/decision-gate" "$TARGET_HOME/.$agent/skills/decision-gate"
done
echo "Skills instaladas; arquivos e links existentes preservados."
