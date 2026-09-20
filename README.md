# agent-skills

Pasta canônica de skills (formato [Agent Skills](https://agentskills.io) — `SKILL.md` com frontmatter `name`/`description`) compartilhada por todos os agentes de código: **Claude Code**, **Codex / app do ChatGPT**, **Cursor** e qualquer outro que leia `~/.agents/skills`.

A única cópia real fica em `skills/`. Os agentes leem por symlink; nada é duplicado.

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

O `install.sh` cria o symlink `~/.agents/skills` e os links individuais em `~/.claude/skills`. É idempotente: rode de novo depois de adicionar skills.

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

## Skills

As skills do vault (`second-brain`, `obsidian-cli`, `obsidian-markdown`) **não** ficam aqui: vivem como skills de projeto dentro do vault Second Brain (`.claude/skills/` e `.agents/skills/`), e só carregam quando o agente está aberto no vault.

| Skill | Descrição | Origem |
|---|---|---|
| `caveman` | Ultra-compressed communication mode that cuts output tokens while keeping technical accuracy. Levels: lite, full, ultra and the wenyan variants.… | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) |
| `code-review` | Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented… | local (menos-juros) |
| `codebase-design` | Shared vocabulary for designing deep modules. Use when the user wants to design or improve a module's interface, find deepening opportunities, deci… | local (menos-juros) |
| `diagnosing-bugs` | Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/fail… | local (menos-juros) |
| `domain-modeling` | Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a CONTEXT.md, or recording or editing an ADR. | local (menos-juros) |
| `gauntlet-loop` | Turns any goal into one short, paste-ready "gauntlet loop" prompt - a prompt that makes an agent set a concrete quality bar, split the work into sm… | [robonuggets/gauntlet-loop](https://github.com/robonuggets/gauntlet-loop) |
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
