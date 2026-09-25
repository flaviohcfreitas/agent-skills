---
name: orchestri
description: Distribui trabalho entre harnesses (Claude Code, Codex, Cursor) pelos quatro papéis — scout, reach, implement, monitoring — usando o melhor modelo de cada papel, ou o modelo que o usuário escolher. Com `--ca`, cada frente roda numa VM do Railway.
disable-model-invocation: true
---

# orchestri — o melhor modelo de cada papel, em qualquer harness

**Ser chamada é a autorização para sair do harness.** Sem esta skill, o agente fica na skill `agent-models` do próprio harness e varia só entre os modelos dele. Com ela, cada papel vai para o harness onde está o modelo daquele papel.

Mantenha a decisão e a integração com o agente principal. Dê a cada frente **um** papel; o papel decide o modelo, e o modelo decide o harness.

## Quem escolhe

O pedido do usuário vence a tabela, nesta ordem:

1. **Papel e modelo nomeados** ("um scout com Haiku") → aquele modelo, no harness dele.
2. **Só o papel** ("um scout") → o padrão da tabela abaixo.
3. **Nada nomeado** → você divide a tarefa em frentes, e **o Jev escolhe o papel de cada uma**.

### O Jev escolhe o papel

Para cada frente sem papel nomeado, monte um candidato por papel, com o modelo do padrão, e rode o roteador do Jev (método em `~/.agents/skills/decision-gate/SKILL.md`):

```bash
node ~/.agents/skills/decision-gate/scripts/rotear.mjs --input rota.json
```

- `pedido`: a tarefa do usuário. `frente_principal`: o que continua com você enquanto a frente roda.
- `candidatos`: `scout`, `implement`, `monitoring` e `reach`, cada um com a mesma `tarefa` e `entrega` da frente, o `modelo` e o `esforco` da tabela, e `custo_relativo` 1 · 2 · 3 · 4 nessa ordem.
- `despachar: true` → a frente vai para o papel devolvido em `candidato`. `despachar: false` → a frente fica com você.
- Exit `1` (sem chave ou API fora): escolha o papel pela tabela e diga que o Jev não foi consultado.

Cada harness roda **só os modelos dele**: Anthropic no Claude Code, OpenAI no Codex, Grok e Composer no Cursor. O modelo pedido que não existe em harness nenhum é erro alto, nunca substituição calada.

## O ciclo

```
scout ──► reach ──► implement ──► monitoring
 medir     decidir    construir     conferir
                        ▲              │
                        └── refaz ─────┤   o diff não cumpre a spec: volta, até 2 voltas
            ▲                          │
            └── lacuna de spec ────────┘   a spec estava errada ou incompleta
```

**A tarefa completa passa pelos quatro, nessa ordem.** A saída de cada papel é o handoff do seguinte: os achados do scout, o plano do reach, o diff do implement. O monitoring fecha com **passou**, **refaz** ou **humano**; refaz volta ao implement, lacuna de spec volta ao reach, e depois da segunda volta é humano. Pular um papel só com o motivo escrito no fechamento.

## O padrão — 25/09/2026

| Papel | O que faz | Modelo | Harness | Se o modelo falhar |
| --- | --- | --- | --- | --- |
| **scout** | varredura barata e em paralelo. Só leitura | GPT-6 Luna, `medium` | Codex | GPT-6 Sol, `low` |
| **reach** | plano, arquitetura, ambiguidade central | Fable 5.1 | Claude Code | Opus 5.5 |
| **implement** | executa o plano do reach, com arquivos exclusivos | Grok 4.7 | Cursor | Composer 2.5 |
| **monitoring** | confere o implement pelo diff e pela verificação. Não conserta | GPT-6 Sol, `max` | Codex | GPT-6 Astra |

A coluna **Se o modelo falhar** fica no mesmo harness. O harness inteiro fora do ar: faça o papel na skill `agent-models` do harness atual e diga isso.

O que cada harness tem por papel, e como chamar lá dentro, vive na skill `agent-models` daquele harness. Modelo novo se troca lá **e** aqui.

- **Pague inteligência no reach e no monitoring, não no scout.**
- **monitoring é de outro provedor que o implement.** Dois modelos do mesmo provedor erram junto.
- **implement com plano incompleto devolve a lacuna** ao principal: decidir é do reach.
- **Cruzar harness custa.** Cada despacho é um processo novo, sem o contexto da sessão. Despache quando o modelo do papel paga o briefing.
- Regra do projeto (piso de modelo, fluxo crítico) vence esta tabela.

## Despachar

Antes de cada despacho, diga a frente, o papel, o harness e o modelo. Uma sessão por frente; scouts independentes saem em paralelo.

**Local, despache por ACP com `acpx`**, não por `-p`/`exec`. Headless é tiro único: não dá para perguntar no meio nem corrigir o rumo, e em background trava calado esperando stdin. ACP mantém uma sessão nomeada que você acompanha, consulta e redireciona.

| Harness | Agente ACP |
| --- | --- |
| Claude Code | `acpx claude` (`claude-agent-acp`) |
| Codex | `acpx codex` (`codex-acp`) |
| Cursor | `acpx cursor` |

```bash
# abrir a frente: sessão nomeada, briefing por arquivo
acpx --model <id> --cwd <repo> --approve-reads <agente> -s <frente> -f briefing.md

# acompanhar sem interromper
acpx <agente> sessions watch -s <frente>

# perguntar ou corrigir no meio (entra na fila da mesma sessão)
acpx <agente> -s <frente> --no-wait "como está? o que já achou?"

# estado, cancelar, fechar
acpx <agente> status -s <frente>
acpx <agente> cancel -s <frente>
acpx <agente> sessions close <frente>
```

- Opções globais (`--model`, `--cwd`, `--approve-*`, `--timeout`) vêm antes do agente; `-s` e `-f` depois.
- Permissão segue o papel: scout e monitoring com `--approve-reads`; implement com `--approve-all`, restrito aos arquivos exclusivos dele no briefing.
- Esforço de raciocínio: `acpx <agente> -s <frente> set <chave> <valor>`, com a chave que o agente anuncia nas opções de config.
- Sem `acpx` instalado: `npx -y acpx@latest ...`. Tiro único descartável, sem conversa: `acpx <agente> exec ...`.
- Quando o usuário perguntar "como está?", mande a pergunta para a sessão. Não responda só pelo log.

### Na nuvem — Railway cloud agents

**`--ca` no pedido manda para o Railway** — `/orchestri <tarefa> --ca`, ou `--ca` escrito na conversa. Vale para todas as frentes daquele pedido; sem `--ca`, o despacho é local. Uma VM nova por frente, com o nome da frente:

| Harness | Comando na VM |
| --- | --- |
| Claude Code | `railway code --claude --new --name <frente> -- -p --model <id> "<briefing>"` |
| Codex | `railway code --codex --new --name <frente> -- exec -m <id> "<briefing>"` |
| Grok | `railway code --grok --new --name <frente> -- -m grok-4.7 --always-approve -p "<briefing>"` |

- **O Cursor não roda no Railway.** O implement Grok 4.7 vai pela Grok CLI (linha acima); o Composer fica local.
- **A VM nasce sem o repositório.** Passe `--bootstrap <molde>` quando o projeto tem molde com o código; sem molde, o briefing diz de onde clonar.
- As credenciais locais de cada CLI são copiadas para a VM: cada pessoa roda com a própria conta.
- **Toda VM se apaga ao fim da frente, com ou sem erro:** `railway ca delete <frente> --yes`. O Railway não desliga VM ociosa, e VM esquecida cobra 24 h por dia. Antes de fechar a resposta, `railway ca list` mostra zero VMs suas desta rodada.

### A passagem de bastão é um handoff

O briefing de cada frente é um **documento de handoff**, escrito pelo método de `~/.agents/skills/handoff/SKILL.md`: o que a próxima sessão precisa para continuar, com ponteiro para spec, plano, issue e diff em vez de cópia, e a seção de skills sugeridas. Acrescente o que é do papel: a definição observável de pronto; o escopo de escrita — scout e monitoring só leem, implement tem arquivos exclusivos; e o formato de volta — conclusão, evidência com `arquivo:linha`, o que mudou, o que ficou em aberto.

O handoff vai inteiro para a frente: por `-f` no ACP, e no texto do comando na VM, que não enxerga o disco local. A volta de cada frente é o handoff da seguinte — o reach passa o plano ao implement, o implement passa o diff ao monitoring.

## Fechar

Entregue o resultado integrado com a linha de cada frente: papel, harness, modelo pedido e modelo confirmado, e o veredito do monitoring.
