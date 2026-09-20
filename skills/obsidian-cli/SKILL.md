---
name: obsidian-cli
description: Opera um vault Obsidian pela CLI `obsidian` — ler, criar, buscar, e consultar o GRAFO (`backlinks`, `links`, `orphans`, `unresolved`). Exige o app desktop ABERTO e o vault registrado. Use ao mexer em vault pela linha de comando, ou ao checar integridade de links.
---

# Obsidian CLI

> **Adaptado neste repo** (08/09/2026): a `description` foi cortada de 467 pra ~250 chars — a
> metade sobre desenvolvimento de plugin e tema (`dev:*`, screenshot, DOM) não se usa aqui, e
> `description` custa contexto em **todo turno**. Os comandos `dev:*` seguem documentados
> abaixo, intactos. Reaplicar ao atualizar a skill.
>
> **Duas armadilhas medidas aqui:** o binário é `/Applications/Obsidian.app/Contents/MacOS/obsidian`
> e, com o app FECHADO, chamá-lo **abre a GUI e pendura** — sempre com teto de tempo. E o
> vault `memory/` deste repo **precisa estar registrado** no Obsidian; não há comando de CLI
> pra registrar (só `vaults` lista), então é passo humano: *Open folder as vault*.

## ⛔ O escopo de vault NÃO funciona — e a máquina tem vault pessoal

**Medido em 09/09/2026, nesta CLI:** `vault=<nome>` é **silenciosamente ignorado**. `orphans`,
`search` e `vault list` foram chamados com um nome de vault **inexistente** e todos responderam
normalmente, com dados do vault **focado**. Sem erro, sem aviso. A documentação abaixo diz que
`vault=` mira um vault específico; **ela não confere com o comportamento observado.**

Então a única coisa que decide em qual vault a CLI mexe é **qual está focado no app** — e a máquina
de quem opera tem vault pessoal registrado ao lado do `memory/` (aqui: `Second Brain` e um vault de
iCloud). Um `create` ou `patch` com o vault pessoal em foco escreve **no vault pessoal**.

**As duas regras, e elas não se negociam:**

1. **Nunca escreva pela CLI.** `create`, `patch`, `rename`, `delete`, `move` — nada disso aqui.
   Escrita no vault deste repo vai pelo **MCP `obsidian-memory`**, que recebe o vault por argumento
   (`mcpvault memory`) e **não depende de foco**. É a única via com destino garantido.
2. **Antes de qualquer leitura pela CLI, confirme o foco:**

   ```bash
   obsidian vault list      # tem que imprimir: memory · .../menos-juros/memory
   ```

   Não imprimiu `memory`? **Pare** e peça pra pessoa focar o vault do repo. Não tente escopar por
   parâmetro — já se sabe que não funciona.

**Pra que a CLI serve, então:** só o que o MCP não faz — as consultas de **grafo** (`backlinks`,
`links`, `orphans`, `unresolved`). É leitura, e com o foco conferido é segura.

Use the `obsidian` CLI to interact with a running Obsidian instance. Requires Obsidian to be open.

## Command reference

Run `obsidian help` to see all available commands. This is always up to date. Full docs: https://help.obsidian.md/cli

## Syntax

**Parameters** take a value with `=`. Quote values with spaces:

```bash
obsidian create name="My Note" content="Hello world"
```

**Flags** are boolean switches with no value:

```bash
obsidian create name="My Note" silent overwrite
```

For multiline content use `\n` for newline and `\t` for tab.

## File targeting

Many commands accept `file` or `path` to target a file. Without either, the active file is used.

- `file=<name>` — resolves like a wikilink (name only, no path or extension needed)
- `path=<path>` — exact path from vault root, e.g. `folder/note.md`

## Vault targeting

Commands target the most recently focused vault by default. Use `vault=<name>` as the first parameter to target a specific vault:

```bash
obsidian vault="My Vault" search query="test"
```

## Common patterns

```bash
obsidian read file="My Note"
obsidian create name="New Note" content="# Hello" template="Template" silent
obsidian append file="My Note" content="New line"
obsidian search query="search term" limit=10
obsidian daily:read
obsidian daily:append content="- [ ] New task"
obsidian property:set name="status" value="done" file="My Note"
obsidian tasks daily todo
obsidian tags sort=count counts
obsidian backlinks file="My Note"
```

Use `--copy` on any command to copy output to clipboard. Use `silent` to prevent files from opening. Use `total` on list commands to get a count.

## Plugin development

### Develop/test cycle

After making code changes to a plugin or theme, follow this workflow:

1. **Reload** the plugin to pick up changes:
   ```bash
   obsidian plugin:reload id=my-plugin
   ```
2. **Check for errors** — if errors appear, fix and repeat from step 1:
   ```bash
   obsidian dev:errors
   ```
3. **Verify visually** with a screenshot or DOM inspection:
   ```bash
   obsidian dev:screenshot path=screenshot.png
   obsidian dev:dom selector=".workspace-leaf" text
   ```
4. **Check console output** for warnings or unexpected logs:
   ```bash
   obsidian dev:console level=error
   ```

### Additional developer commands

Run JavaScript in the app context:

```bash
obsidian eval code="app.vault.getFiles().length"
```

Inspect CSS values:

```bash
obsidian dev:css selector=".workspace-leaf" prop=background-color
```

Toggle mobile emulation:

```bash
obsidian dev:mobile on
```

Run `obsidian help` to see additional developer commands including CDP and debugger controls.
