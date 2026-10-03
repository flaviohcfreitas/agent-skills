# agent-skills

Pasta canônica de skills (formato [Agent Skills](https://agentskills.io) — `SKILL.md` com frontmatter `name`/`description`) compartilhada por todos os agentes de código: **Claude Code**, **Codex / app do ChatGPT**, **Cursor** e qualquer outro que leia `~/.agents/skills`.

As skills compartilhadas ficam em `skills/`; as versões próprias de cada harness ficam em `<agente>/skills/`. Os agentes leem por symlink; nada é duplicado.

## Como os agentes encontram as skills

| Agente | Onde procura | Como chega aqui |
|---|---|---|
| Codex CLI, extensão IDE e app desktop do ChatGPT | `~/.agents/skills` | `~/.agents/skills` → symlink para `skills/` deste repo |
| Cursor | `~/.agents/skills` (e `~/.cursor/skills`) | mesmo symlink acima |
| Claude Code | `~/.claude/skills/<skill>` | um symlink por skill apontando para `~/.agents/skills/<skill>` |
| ChatGPT web | não lê pasta local | só via plugin; ou anexe o `SKILL.md` num Project/GPT |

## Instalar em outra máquina

```bash
git clone https://github.com/flaviohcfreitas/agent-skills.git ~/Sources/agents
~/Sources/agents/install.sh
```

O `install.sh` conecta as skills compartilhadas e as exclusivas de cada agente. É idempotente: rode de novo depois de adicionar skills. Preserva pastas locais existentes do Claude e interrompe em links conflitantes, sem mover ou apagar conteúdo.

Alternativa sem clonar (copia em vez de linkar, e não acompanha este repo):

```bash
npx skills@latest add flaviohcfreitas/agent-skills --all -g
```

## Adicionar uma skill nova

```bash
# de um repo GitHub (instala direto em skills/ via ~/.agents/skills)
npx skills@latest add <owner>/<repo> --skill <nome> -g -a claude-code codex cursor -y

# ou crie à mão
mkdir skills/<nome> && $EDITOR skills/<nome>/SKILL.md
./install.sh
```

Depois: `git add skills/<nome> && git commit && git push`.

## Versões por harness

A pasta `skills/` continua compartilhada. Para dar a cada harness uma versão própria, coloque-a fora da pasta compartilhada:

| Origem neste repositório | Destino de instalação | Uso pretendido |
|---|---|---|
| `skills/<nome>/` | `~/.agents/skills` e links no Claude | Todos os agentes configurados |
| `codex/skills/<nome>/` | `~/.codex/skills/<nome>` | Codex |
| `claude/skills/<nome>/` | `~/.claude/skills/<nome>` | Claude Code |
| `cursor/skills/<nome>/` | `~/.cursor/skills/<nome>` | Cursor |

Depois de criar a pasta com `SKILL.md`, execute `./install.sh`. Use nomes diferentes dos compartilhados e das outras versões. Não coloque uma versão própria dentro de `skills/`: o link global tornaria seu conteúdo compartilhado.

**Limite da separação:** o Cursor também descobre `~/.claude/skills` e `~/.codex/skills` por compatibilidade. Portanto, caminhos separados não são isolamento estrito de descoberta no Cursor. As versões de orquestração usam nomes diferentes para evitar colisões e dizem explicitamente em qual harness operar. Desativar todas as importações de terceiros no Cursor também afetaria outras skills e configurações, então o instalador não altera essa preferência. Consulte a [documentação de skills do Cursor](https://prod.cursor.com/docs/skills).

A tabela de harness e modelo por papel — **scout**, **reach**, **implement** e **monitoring** — mora num arquivo só, [`papeis/harnesses.mjs`](papeis/harnesses.mjs), e os quatro agentes (`claude/agents/`) a leem antes de trabalhar, em qualquer harness. O padrão roda no harness do agente → ele faz o trabalho; o padrão é outro harness → o agente é a ponte e chama a CLI dele, com prova da execução; ausente ou falhou → o próximo candidato, dito em voz alta. `PAPEIS_SO=claude,codex` restringe os harnesses. Codex e Cursor têm a skill **`agent-models`**, que só diz como delegar em cada harness (briefing, Jev, integração, que vem do [vídeo de Rafael Quintanilha](https://www.youtube.com/watch?v=n4e5wV3unA4)); a `orchestri` e o `orbti-loop` saíram.

```bash
node ~/.agents/papeis/harnesses.mjs resolver scout --aqui claude:claude-haiku-4-5
```

O harness e o modelo padrão de cada papel estão em [`papeis/harnesses.mjs`](papeis/harnesses.mjs) (fonte única); `resolver <papel>` mostra quem roda aqui.

**Instalar:** `./install.sh` liga `~/.agents/papeis` → `papeis/`. Para os subagentes poderem rodar as CLIs externas sem pedir permissão a cada chamada, acrescente em `~/.claude/settings.json`, em `permissions.allow`, a linha `Bash(node ~/.agents/papeis/harnesses.mjs rodar:*)`. Quem tinha a `orchestri` instalada remove o link quebrado: `rm ~/.claude/skills/orchestri ~/.agents/skills/orchestri`.

**Workflows:** `./install.sh` também liga, arquivo a arquivo, `claude/workflows/*.js` (`laco-de-refaz`, `ondas`, `adversarial`) em `~/.claude/workflows/`; só o Claude Code os executa. Teste: `node --test claude/workflows/`.

`~/.codex/skills` é o diretório específico já usado por esta instalação do Codex. Abra uma nova tarefa ou reinicie o aplicativo se a skill não aparecer. Não é necessário alterar `config.toml`. O instalador também aceita `AGENT_SKILLS_HOME=/caminho` para conferir os links em um destino isolado.

## Decision Gate global

A cópia canônica do Jev fica em `skills/decision-gate/`, vista como `~/.agents/skills/decision-gate` pela instalação global. `./install.sh` conecta essa mesma skill ao Claude Code, Codex e Cursor. O roteador `scripts/rotear.mjs` recebe um pedido, a frente do principal e candidatos concretos; devolve se vale despachar e qual candidato. `scripts/juiz.mjs` continua avaliando gate, retorno de subagente e comparação. O modo de bancada usa a CLI do Claude.

Para chamadas reais, configure `OPENROUTER_API_KEY` no ambiente do harness ou em `~/.config/juiz/.env` com permissão `600`. A chave não fica neste repositório. `--seco` permite inspecionar a decisão sem chamar a API. Sem chave ou com erro, o juiz devolve erro explícito; a skill decide localmente e informa a limitação. O juiz recomenda, mas não cria subagentes nem altera permissões.

Os hooks globais de usuário de Codex, Claude e Cursor apontam para `skills/decision-gate/scripts/hook-stop.mjs` nesta skill compartilhada. O hook de encerramento apenas fiscaliza o recibo local gerado por `juiz --gate`; ele não chama o Jev, não roda em cada edição e não substitui a verificação do projeto. Cada harness pode exigir revisão/confiança do hook depois que a configuração mudar.

## Skills

As skills do Obsidian (`obsidian-cli`, `obsidian-markdown`) **não** ficam aqui: vivem como skills de projeto dentro do vault Second Brain (`.claude/skills/` e `.agents/skills/`), e só carregam quando o agente está aberto no vault.

| Skill | Descrição | Origem |
|---|---|---|
| `caveman` | Ultra-compressed communication mode that cuts output tokens while keeping technical accuracy. Levels: lite, full, ultra and the wenyan variants.… | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) |
| `code-review` | Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented… | local (menos-juros) |
| `codebase-design` | Shared vocabulary for designing deep modules. Use when the user wants to design or improve a module's interface, find deepening opportunities, deci… | local (menos-juros) |
| `diagnosing-bugs` | Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/fail… | local (menos-juros) |
| `domain-modeling` | Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a CONTEXT.md, or recording or editing an ADR. | local (menos-juros) |
| `grill-me` | A relentless interview to sharpen a plan or design. | local (menos-juros) |
| `grill-with-docs` | A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go. | local (menos-juros) |
| `grilling` | Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phr… | local (menos-juros) |
| `handoff` | Compact the current conversation into a handoff document for another agent to pick up. | local (menos-juros) |
| `impeccable` | Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract,… | local (menos-juros) |
| `implement` | Implement a piece of work based on a spec or set of tickets. | local (menos-juros) |
| `improve-codebase-architecture` | Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick. | local (menos-juros) |
| `karpathy-guidelines` | Behavioral guidelines to reduce common LLM coding mistakes. Use when writing, reviewing, or refactoring code to avoid overcomplication, make surgic… | [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) |
| `llm-wiki` | Karpathy's LLM Wiki: build/query interlinked markdown KB. | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) |
| `multica` | O board do Multica pela CLI — sub-issue com a ORDEM DE EXECUÇÃO em `--stage`, propor vs disparar outro agente, e o próprio card com `--no-start`. U… | local (menos-juros) |
| `prototype` | Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, or exp… | local (menos-juros) |
| `research` | Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic… | local (menos-juros) |
| `resolving-merge-conflicts` | Use when you need to resolve an in-progress git merge/rebase conflict. | local (menos-juros) |
| `second-brain` | Opera o vault Obsidian "Second Brain" do Flávio: onde cada coisa mora, a governança em Memoria/Contratos e o protocolo de memória compartilhada que todo agente segue. | local |
| `tdd` | Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests. | local (menos-juros) |
| `teach` | Teach the user a new skill or concept, within this workspace. | local (menos-juros) |
| `to-map` | Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at… | local (menos-juros) |
| `to-questionnaire` | Turn a decision you can't fully answer into a questionnaire for someone else to fill in. | local (menos-juros) |
| `to-spec` | Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed. | local (menos-juros) |
| `to-tickets` | Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured… | local (menos-juros) |
| `triage` | Move issues and external PRs through a state machine of triage roles, categorise, verify, grill if needed, and write agent-ready briefs. | [mattpocock/skills](https://github.com/mattpocock/skills) |
| `use-railway` | Operate Railway infrastructure: sign up for or sign in to a Railway account, create projects, provision services, databases, and buckets, deploy… | local |
| `wait-what` | Stop. That last message did not land: re-pitch it. | local (menos-juros) |
| `wizard` | Generate an interactive bash wizard that walks a human through steps only they can perform. Use when provisioning infrastructure, setting up creden… | local (menos-juros) |

As skills marcadas como `local (menos-juros)` nasceram em `menos-juros/.claude/skills`; várias derivam de [mattpocock/skills](https://github.com/mattpocock/skills) e [pbakaus/impeccable](https://github.com/pbakaus/impeccable). A cópia no projeto menos-juros continua existindo; esta é a versão canônica para uso global.
