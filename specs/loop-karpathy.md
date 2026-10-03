# Spec: o agent-loop — o loop de construção do Karpathy, sobre os quatro agentes

> Status: rascunho do reach, 03/10/2026, revisado no mesmo dia (nome `agent-loop`; só modelos Claude,
> monitoring no Fable, seção 4.6). Não construído. As perguntas abertas estão no fim; as
> recomendações valem como decisão se o Flávio não responder diferente.
> Fontes: o vídeo do AI Labs ("Karpathy loop", resumo no pedido), `agent.md`,
> `specs/padroes-de-grafo.md`, `claude/workflows/*.js`, `papeis/harnesses.mjs`,
> `skills/decision-gate/scripts/juiz.mjs`, `skills/multica/SKILL.md`, e no MenosJuros
> `scripts/harness/sincronizar-skills.sh` e `scripts/hooks/contexto-core.mjs`.

## 1. Problema

O Flávio quer **um loop que constrói até a tarefa ficar pronta**, no método do Karpathy
(autoresearch): cada rodada é um experimento; o agente muda o código, uma nota que ele **não pode
tocar** diz se melhorou; melhorou fica, igual ou pior **desfaz**. O vídeo mostra o método aplicado a
features de app (checks escritos e aprovados antes, pasta travada, um builder novo por rodada,
arquivo de resultados, relatório) e o defeito dele: o loop corrige um erro numa rodada e repete na
feature seguinte, porque o builder nasce com as mesmas instruções. A correção do vídeo é um segundo
loop (`auto-loop`) que lê os resultados e reescreve a parte "como trabalhar" do `program.md`.

Hoje nada do harness faz isso:

- o **laço de refaz** (`claude/workflows/laco-de-refaz.js`) itera **sobre o mesmo trabalho**: o
  implement refaz por cima da entrega anterior, sem desfazer, com teto de 2 voltas. É um conserto,
  não um experimento;
- as **ondas** distribuem tickets por dependência, cada um no seu laço;
- nenhum dos dois tem **nota travada**: os testes do ticket são escritos pelo mesmo implement (tdd) e
  ele pode mudá-los;
- nenhum guarda o que cada tentativa ensinou para a tentativa seguinte.

**Duas decisões do usuário já fechadas** (mensagem da sessão, 03/10/2026):

1. **A memória do projeto é o Multica**, não uma skill `project-context` nova. O loop cria os cards
   e documenta os passos lá.
2. **A nota da rodada passa pelo Jev** (`juiz.mjs --gate`), com os checks travados entrando como
   `--verificar-saida`. O construtor continua sem poder tocar no que dá a nota.

## 2. Os 4 critérios — quando uma tarefa é loop

Uma tarefa só vira agent-loop se cumpre **os quatro**. A sessão os confere um a um, por escrito.

| # | Critério | Como a sessão confere | Não é loop quando |
|---|---|---|---|
| 1 | **Repete**: várias features, ou uma feature com muitas tentativas prováveis | há uma lista de features (cards do projeto) ou o caminho é de tentativa e erro (algoritmo, layout, ajuste fino) | é uma mudança de uma linha, ou o caminho já está claro (vai para o **laço de refaz**) |
| 2 | **Cabe no orçamento**: toda rodada relê o contexto, inclusive as que falham | estimativa ≈ rodadas × (implement + monitoring); teto padrão de 12 rodadas por feature | a feature exige ler o monorepo inteiro em cada rodada |
| 3 | **Conferível sem humano**: um comando dá a nota, sem olho humano | dá para escrever checks que rodam e falham hoje | o critério de pronto é gosto (visual, texto), ou **fluxo crítico** (crédito, dinheiro, cadastro, auth): lá o fim nunca é `passou` sozinho |
| 4 | **O agente roda o que construiu** e vê o que quebra | o comando dos checks roda localmente, sem produção | depende de produção, de credencial humana ou de serviço externo sem dublê |

**Uma feature por vez, nunca o app inteiro.** Cada feature tem os seus checks, o seu card e a sua
corrida do agent-loop.

## 3. O padrão no grafo: **agent-loop**

O nome é decisão do Flávio (03/10/2026). O mecanismo é uma catraca: cada rodada ou avança o estado
mantido ou é desfeita, e o estado mantido nunca piora. **Sem colisão**, conferido em 03/10/2026:
nenhuma pasta `agent-loop*` em `~/Sources/agents/skills/`, `~/.claude/skills/`,
`~/.claude/workflows/`, `~/.claude/plugins/`, nem em `.claude/skills/` ou `.claude/workflows/` do
MenosJuros; a skill nativa do Claude Code é `/loop` (repete um prompt num intervalo), outro nome.

```
            [usuário aprova a lista]          [usuário aprova os checks]
REACH ── checks em palavras ──► IMPLEMENT ── checks vermelhos ──► MONITORING ── travar (hash)
                                                                                │
   ┌────────────────────────────────────── workflow agent-loop-rodadas ───────────┘
   ▼
 preflight ─► ┌─► IMPLEMENT (contexto novo: program.md + últimas rodadas + checks que falham)
              │        │ uma hipótese, só nos arquivos permitidos
              │        ▼
              │   MONITORING roda `agent-loop.mjs rodada`:
              │     trava → checks → guarda → Jev → decide → mantém (commit) | desfaz (reset) → registra
              │        │
              │   o código confere a decisão ── manteve e pronto ──► FECHAMENTO (monitoring: verificação
              └── segue ◄─ manteve/desfez                              inteira + code-review + Jev) ─► fim
                       ▼
          violação · humano · estagnou · teto · orçamento ─► fim
```

| | **laço de refaz** | **ondas** | **agent-loop** |
|---|---|---|---|
| Unidade | um ticket | N tickets | uma feature |
| O que itera | o mesmo trabalho, consertado por cima | ondas de laços | experimentos independentes sobre o último estado mantido |
| Rodada ruim | refaz por cima | — | **desfeita** (o estado volta ao último mantido) |
| Nota | Jev sobre spec + diff + verificação do próprio implement | Jev no fechamento | **checks travados** (o construtor não toca) + Jev |
| Quem escreveu o teste | o implement da fatia | idem | escritos e **aprovados antes**, por outro passo, travados por hash |
| Teto | 2 voltas; na 3ª, humano | o do laço, por ticket | 12 rodadas (até 30), ou 4 desfeitas seguidas |
| Contexto do implement | o mesmo ticket + o que faltou | idem | novo a cada rodada + o registro das rodadas |
| Commit | nenhum | nenhum | **um por rodada mantida, só no branch `agent-loop/<slug>` do worktree dela** (P7) |
| Harness e modelo | os de `harnesses.mjs` | idem | **só Claude**: implement Sonnet 5.5, monitoring Fable 5.1 (seção 4.6) |

**Quando cada um:** caminho claro e uma fatia → laço de refaz. Vários tickets com dependência →
ondas. Caminho incerto, muitas tentativas, nota mecânica possível → agent-loop. O agent-loop **não** chama
`laco-de-refaz` nem `ondas`, e nenhum deles a chama: a sessão escolhe um.

Entra no `agent.md`, tabela **Os padrões**:

| **agent-loop** | reach escreve os checks → humano aprova → travados → rodadas de implement (contexto novo) → monitoring dá a nota (checks + Jev): mantém ou desfaz → fechamento | workflow `agent-loop-rodadas` |

E na tabela **A primeira decisão: qual caminho**, uma linha antes da complexa:

| a tarefa cumpre os **4 critérios do agent-loop** | **sugerir** o agent-loop e **perguntar**; nunca disparar |

## 4. As skills e o workflow

O que o vídeo cria, e o que vira aqui:

| Peça do vídeo | Aqui | Por quê |
|---|---|---|
| `project-context` | **nada novo**: o Multica (decisão 1) + as docs de domínio do projeto. No MenosJuros, o bloco core `dominios` (injetado por `contexto-core.mjs`) já diz o que é cada domínio e onde mora o código, e `dominios/<slug>/CONTEXT.md` tem o resto | o `program.md` **aponta** para esses arquivos; não os copia |
| `build` | skill **`agent-loop`** (a porta) + workflow **`agent-loop-rodadas`** | ordem e teto em código; a skill guarda os gates humanos |
| `write-checks` + `approve-checks` | skill **`agent-loop-checks`** + `agent-loop.mjs travar` | aprovar é ato humano, não skill; travar é script |
| `feature-builder` | o papel **implement** (já existe) | contexto novo por rodada é natural em `agent()` |
| resultados | `.agent-loop/<slug>/rodadas.jsonl` (repo) + comentário por rodada no card (Multica) | seção 5 |
| `features.md` | os **cards do projeto no Multica**, com `[S<n>]` na ordem de ataque | é o que a `multica` já faz |
| `program.md` | `.agent-loop/program.md`, com o bloco "Como trabalhar" entre marcadores | seção 5 |
| `auto-loop` | skill **`agent-loop-habitos`**, **versão 2** (P3) | precisa de 2 features de dados para achar repetição |

### 4.1 `agent-loop` — a porta

- **Onde vive:** `~/Sources/agents/skills/agent-loop/SKILL.md`, com `scripts/agent-loop.mjs`,
  `scripts/agent-loop.test.mjs` e `modelos/program.md`. Link em `~/.agents/skills/agent-loop` (a pasta
  inteira já é symlink) e em `~/.claude/skills/agent-loop` (o laço da linha 36 do `install.sh` já cobre).
- **O que faz, nesta ordem:**
  1. **Confere os 4 critérios** e a criticidade (regex da seção 9). Algum falha → diz qual e propõe o
     caminho certo (laço de refaz, ou a feature quebrada menor). Para.
  2. **Card**: acha ou cria o card da feature no projeto do Multica (seção 5.2), com `--no-start`.
  3. **Spec da feature** pelo **reach** (`to-spec` sobre o card): objetivo, critérios de pronto,
     `arquivos` permitidos (com prefixo de pasta), comando de guarda. Vai para o **corpo** do card.
  4. **Worktree**: `git worktree add <repo>/.claude/worktrees/agent-loop-<slug> -b agent-loop/<slug> HEAD`,
     e instala dependências lá (`pnpm install --frozen-lockfile` no MenosJuros). Trabalho do usuário
     sem commit **não entra** no worktree: a skill avisa se `git status` não está limpo e pergunta se
     a feature depende dele.
  5. **Checks**: chama `agent-loop-checks` se `.agent-loop/<slug>/manifesto.json` não existe aprovado.
  6. **`program.md`**: cria `.agent-loop/program.md` do modelo se não existe (seção 5.1).
  7. **Dispara** `Workflow({ name: 'agent-loop-rodadas', args })` (seção 4.3).
  8. **Relata** `estado`, `motivo`, `proximo_passo`, a nota final e o link do card; roda
     `agent-loop.mjs publicar` para os comentários que não subiram (seção 5.2); move o card para
     `in_review --no-start` com o contrato de monitoramento. Commit no branch do usuário, PR e merge
     são da sessão, sob o gate humano.
- **Agentes:** reach (spec), scout (se faltar fato: onde mora o código, que comando roda o teste),
  e, pelo workflow, implement e monitoring.
- **Em Codex e Cursor:** a skill não roda o loop (workflow `.js` só existe no Claude Code). Ela diz
  isso e para depois do passo 6.

### 4.2 `agent-loop-checks` — escreve e trava os checks

- **Onde vive:** `~/Sources/agents/skills/agent-loop-checks/SKILL.md`.
- **O caminho:**
  1. **reach** escreve a **lista em palavras simples**: um item por check, com o que ele prova e o
     que **não** prova. Inclui sempre um check de **ligação** ("a feature é alcançável a partir do
     app: rota, menu, endpoint registrado"), a lição do vídeo de checks verdes com tela desligada.
  2. **A sessão mostra a lista ao usuário e espera.** Gate humano 1.
  3. **implement** escreve os checks em `.agent-loop/<slug>/rascunho/` e o `comando` que os roda
     (descoberto por scout se preciso), mais o `comando_guarda` (os testes já existentes da área,
     para pegar regressão fora dos checks).
  4. **monitoring** roda os checks e confere que **todos falham, e pelo motivo certo** (feature
     ausente, não erro de import ou de sintaxe), e que cobrem cada item da lista. Check que passa
     antes de construir não mede nada → volta ao implement.
  5. **A sessão mostra os checks e a saída vermelha ao usuário e espera.** Gate humano 2.
  6. Aprovado → `node ~/.agents/skills/agent-loop/scripts/agent-loop.mjs travar --slug <slug>`: move
     `rascunho/` para `checks/`, grava `manifesto.json` (`base`, `comando`, `comando_guarda`,
     `arquivos`, a lista em palavras, `hash`) e faz **um commit** no branch `agent-loop/<slug>`. Imprime
     o `hash`, que a sessão grava no corpo do card e passa ao workflow.
- **Agentes:** reach → implement → monitoring, com dois gates humanos.

### 4.3 `agent-loop-rodadas` — o workflow

- **Onde vive:** `~/Sources/agents/claude/workflows/agent-loop-rodadas.js`, linkado por arquivo em
  `~/.claude/workflows/` pelo `install.sh` (o glob `*.js` já o pega). Testes em `agent-loop.test.mjs`
  ao lado, com o mesmo `simular.mjs`.
- **Regras de workflow:** `meta` literal puro; sem `Date.now`/`Math.random`/`new Date(`;
  `agent()` só com `agentType` de papel, sem `model` nem `effort`; **não** chama `workflow()` (não é
  aninhado em nada e não aninha nada); rótulos determinísticos (`implement:<slug>.<n>`,
  `monitoring:<slug>.<n>`) para a retomada funcionar.
- **Entrada (`args`):**

  ```js
  {
    slug: 'filtro-de-propostas',      // obrigatório: [a-z0-9-]
    raiz: '/abs/.claude/worktrees/agent-loop-filtro-de-propostas',  // obrigatório: o worktree
    hash_checks: 'sha256:…',           // obrigatório: o que o travar imprimiu
    card: 'MJ-123',                    // opcional: sem ele, nada vai ao Multica
    spec: '...',                       // obrigatório: a spec da feature (o corpo do card)
    rodadas: 12,                       // opcional; teto duro no código: 30
    critico: false, autorizar_critico: false,
  }
  ```

- **O grafo:** `validar → trava crítica → preflight → [implement → monitoring → conferir] × até o
  teto → fechamento`.
  - **validar** e **trava crítica** sem gastar agente, como o laço (seções 4.2 e 4.3 de
    `padroes-de-grafo.md`): inválido → `invalido`; crítico sem autorização → `critico`, zero agentes.
  - **preflight** (`monitoring`): roda `agent-loop.mjs preflight --raiz … --slug …`, que confere: a raiz
    é worktree (não o checkout principal), o branch começa com `agent-loop/`, a árvore está limpa, o hash
    dos checks bate, o `comando` roda, e **um commit vazio seguido de reset funciona** no `claude -p`
    do monitoring (seção 4.6; sem sandbox de SO, o risco é baixo, e o teste custa um comando).
    Devolve também o `harness:modelo` de quem rodou, que o código confere (seção 4.6). Qualquer
    falha → `estado: 'sem_git'`, `'harness'` ou `'invalido'`, **zero implements**.
  - **implement** (`agentType: 'implement'`), contexto novo: o caminho do `program.md` (ler inteiro),
    a spec, os `arquivos` permitidos, as **últimas 8 rodadas** (hipótese, decisão, checks que
    falharam, observação do monitoring), a saída dos checks do último estado mantido, e as regras:
    **uma hipótese por rodada**; trabalhe só em `raiz`; não toque em
    `.agent-loop/`; não rode `git commit`, `reset`, `checkout`, `stash` nem `clean`; devolva
    `{ hipotese, arquivos, lacuna?, harness, modelo }`. `lacuna` → fim `lacuna`.
  - **monitoring** (`agentType: 'monitoring'`, ponte para o Fable, seção 4.6, com `rodar --cwd <raiz>`
    e `--construtor claude:claude-sonnet-5-5`): calcula `shasum -a 256` do `agent-loop.mjs` e o devolve;
    roda `agent-loop.mjs rodada --raiz … --slug … --n <n> --hipotese-arquivo … --hash <hash_checks>
    [--critico] [--card <card>]`; devolve o JSON do stdout e o exit **sem interpretar**, mais uma
    `observacao` de até 3 frases (o que a rodada tentou e por que a nota ficou como ficou), que é o
    sinal para o próximo implement — o Jev devolve `refaz` sem lista de faltas.
  - **conferir** (código): recalcula a decisão com a **mesma função pura** do script
    (`decidirRodada`, seção 7) a partir dos números devolvidos; divergência, hash do script diferente
    do da 1ª rodada, ou `hash` dos checks diferente de `args.hash_checks` → fim `violacao`;
    `harness:modelo` fora do esperado (seção 4.6) → fim `harness`.
  - **fechamento** (`monitoring`), só quando a rodada mantida tem todos os checks verdes e o Jev
    passou: verificação **inteira** do projeto (`npm run verificar` quando existe), a skill
    `code-review` nos dois eixos sobre `git diff <base>..HEAD` do branch, e o Jev `--gate` sobre a
    spec e esse diff. O veredito sai da função `decidir` do `laco-de-refaz` (copiada, com teste de
    paridade). `refaz` aqui **não volta sozinho**: vira `refaz_fechamento` com o `faltou`.
- **Os tetos, em código:** `rodadas` (padrão 12, máximo 30); **estagnação**: 4 rodadas desfeitas
  seguidas → `estagnou`; **orçamento**: com `budget.total`, para quando `budget.remaining()` cai
  abaixo do custo médio das rodadas já feitas → `orcamento`.
- **Retorno:**

  ```js
  {
    padrao: 'agent-loop',
    slug, card,
    estado: 'pronto' | 'revisao_humana' | 'refaz_fechamento' | 'estagnou' | 'teto' | 'orcamento'
          | 'humano' | 'violacao' | 'harness' | 'sem_git' | 'lacuna' | 'critico' | 'invalido',
    rodadas: 9, mantidas: 4, desfeitas: 5,
    nota: { passam: 7, total: 7 },               // do último estado mantido
    head: '<sha>',                                // o último commit mantido no branch agent-loop/<slug>
    historico: [{ n, hipotese, decisao, passam, jev: { exit, confianca }, motivo }],
    fechamento: { jev, verificacao, code_review, faltou },
    motivo, proximo_passo, decidido_sozinho: [...],
  }
  ```

### 4.4 `agent-loop-habitos` — o loop que melhora o loop (versão 2)

- **Onde vive:** `~/Sources/agents/skills/agent-loop-habitos/SKILL.md`.
- **O que faz:** depois de uma feature fechar, o **reach** lê os `resultados.jsonl` de **todas** as
  features do projeto e a observação de cada rodada; acha o que se repete (o mesmo check falhando
  pelo mesmo motivo em duas features, a mesma lacuna, o mesmo tipo de rodada desfeita); escreve cada
  hábito **com as rodadas que o mostram** (`filtro-de-propostas#3, #5; exportar-csv#2`); e reescreve
  **só** o bloco entre `<!-- como-trabalhar:inicio -->` e `<!-- como-trabalhar:fim -->`.
- **Nunca** edita checks, manifesto nem o bloco "Regras fixas". Defesa em código:
  `agent-loop.mjs habitos --conferir` falha se algo fora do bloco mudou.
- **Gate:** o diff do `program.md` vai ao usuário antes do commit. Hábito é memória procedural, e
  procedural muda por revisão humana (CLAUDE.md do MenosJuros, "editar doc é do humano").
- **Na versão 1** só o contrato de dados entra: `rodadas.jsonl` já grava tudo que ela vai ler.

### 4.5 A cópia no MenosJuros

- `npm run skills:sincronizar` (`scripts/harness/sincronizar-skills.sh`) **só atualiza skill que
  existe dos dois lados** (`[ -f "$GLOBAL/$nome/SKILL.md" ] || continue` sobre as pastas locais). Skill
  global nova, incluindo as próprias do Flávio, **só entra se alguém criar a pasta antes**:
  `mkdir .claude/skills/agent-loop .claude/skills/agent-loop-checks` e depois sincronizar (o `rsync
  --delete` copia `scripts/` e `modelos/` junto).
- O workflow `agent-loop-rodadas` **não** é copiado: vive só no global, como `laco-de-refaz` (o
  `.claude/workflows/` do projeto não tem nenhum dos três). A cópia da skill sem o install global não
  roda o loop; ela diz isso.
- Entrar no projeto mexe na doc do harness, e o `check-harness-docs.sh` (hook `pre-commit-docs`)
  barra drift: a contagem "36 skills" do `CLAUDE.md`, a linha em `docs/harness/skills-catalog.md` com
  a justificativa, a tabela de papéis do `CLAUDE.md` e o `agent.md` do projeto (padrão **agent-loop** e
  o caminho das duas skills). É um ticket próprio, no repo do MenosJuros.

### 4.6 Só Claude: implement Sonnet, monitoring Fable

Decisão do Flávio (03/10/2026): o agent-loop roda **100% com modelos Claude**, sem Codex, Cursor
nem Grok, e o monitoring é o **Fable** (`claude-fable-5-1`). A tabela global de `harnesses.mjs`
não muda para os outros usos. O Jev continua sendo a nota (decisão 2): ele é um classificador da
TypeSafe pelo OpenRouter, não um harness de papel.

**O que a tabela dá hoje** (rodado em 03/10/2026):

| Comando | Resultado |
|---|---|
| `PAPEIS_SO=claude … resolver implement --aqui claude:claude-sonnet-5-5` | `claude:claude-sonnet-5-5`, **nativo** (o `implement.md` já é `model: sonnet`) |
| `PAPEIS_SO=claude … resolver monitoring --aqui claude:claude-opus-5-5 --construtor claude:claude-sonnet-5-5 --escalada` | `claude:claude-opus-5-5`, nativo, aviso "mesmo provedor": **o `--escalada` hoje só vale para o reach** (`lista()`, `p === 'reach'`) |

**A mudança, pequena e com teste, em `papeis/harnesses.mjs`:**

- o candidato Claude do monitoring ganha `escalada: 'claude-fable-5-1'`, como o do reach;
- `lista()` aplica a escalada a `reach` **e** `monitoring`.

Sem `--escalada`, nada muda para ninguém. Com `--escalada` e o Codex permitido, o Sol continua na
frente (a escalada troca o modelo do candidato Claude, não a ordem). Só a combinação
`PAPEIS_SO=claude` + `--escalada` dá o Fable, e só o agent-loop a usa.

**Como chega ao agente, sem `model` no `agent()`:** o workflow não escolhe modelo nem passa
ambiente. Ele põe no topo de cada briefing uma linha
`PAPEIS: PAPEIS_SO=claude --escalada`, e os quatro `claude/agents/*.md` ganham uma frase no passo 2:
"se o briefing traz uma linha `PAPEIS:`, rode o resolver com aquele ambiente e aquelas opções".
Com isso:

- **implement** (subagente `implement`, Sonnet): o resolver dá `claude:claude-sonnet-5-5` e ele é
  **nativo**, sem ponte;
- **monitoring** (subagente `monitoring`, Opus pelo frontmatter): o resolver dá
  `claude:claude-fable-5-1`, `nativo: false`, e o `comando` que já existe para Claude não nativo:
  `claude -p --agent monitoring --model fable --effort high --permission-mode dontAsk --allowedTools
  "Read Grep Glob Bash" --permission-prompts none`. O Opus é a **ponte**: roda
  `rodar … --cwd <raiz> --briefing -` e transcreve. Custa um salto de Opus por rodada, que só
  repassa.

**A defesa em código não depende do prompt:** o schema de volta exige `harness` e `modelo` (e, na
ponte, `execucao.comando` e `execucao.exit`). O workflow confere: implement com `harness === 'claude'`
e modelo `claude-*`; monitoring com `modelo === 'claude-fable-5-1'` e `execucao.comando` contendo
`--model fable`. Fora disso → `estado: 'harness'`, a rodada não conta, e a corrida para.

**Alternativas recusadas:** `model` no `agent()` (proibido pela regra dos padrões); um `agentType`
`monitoring-fable` (os tipos são os quatro papéis); trocar o frontmatter do `monitoring.md` para
Fable (muda o monitoring de todo mundo).

**O que isso resolve:** o monitoring sai do sandbox do Codex (`workspace-write` com o `.git` fora do
alcance), então o commit e o reset da rodada rodam no `claude -p` com Bash. E o implement sai do
`cursor-agent --force`: a regra de deny da seção 6 passa a valer para ele.

## 5. Os arquivos por tarefa: o que fica no repo e o que fica no Multica

A regra: **o que o agente precisa ler para trabalhar, e o que dá a nota, fica no repo**, versionado
junto com o código que governa; o agente lê o arquivo sem rede nem login no Multica, e a nota tem de
ser reproduzível por hash. **O que conta a história para o humano fica no
Multica**, escolhido por duração como a skill `multica` manda.

### 5.1 No repo, no branch `agent-loop/<slug>`

| Arquivo | O que é | Versionado |
|---|---|---|
| `.agent-loop/program.md` | um por projeto: "Regras fixas" (hash junto dos checks) + "Como trabalhar" (entre marcadores; muda pela `agent-loop-habitos`) + "Contexto" (só ponteiros: `dominios/<slug>/`, `CONTEXT.md`) | sim |
| `.agent-loop/<slug>/checks/` | os checks travados | sim, commitados pelo `travar` |
| `.agent-loop/<slug>/manifesto.json` | `base`, `comando`, `comando_guarda`, `arquivos`, a lista em palavras, `hash` | sim |
| `.agent-loop/<slug>/rodadas.jsonl` | uma linha por rodada, append-only, encadeada (cada linha leva o sha256 da anterior) | **não**: ignorado (`.agent-loop/.gitignore`), para sobreviver ao `reset --hard` da rodada desfeita, como o `results.tsv` do autoresearch |
| `.agent-loop/<slug>/descartadas/rodada-<n>.patch` | o diff de cada rodada desfeita | não (ignorado); nada se perde ao desfazer |
| `.agent-loop/<slug>/resultados.jsonl` + `relatorio.md` | cópia final do `rodadas.jsonl` + o relatório | sim, no último commit (`agent-loop.mjs fechar`) |

As "Regras fixas" do modelo incluem: só os arquivos permitidos; nunca `.agent-loop/`; nunca comentário
que declare critério cumprido ("// atende o critério X"); nunca produção (no MenosJuros, nunca
`npm run dev:prod`); uma hipótese por rodada, declarada.

### 5.2 No Multica

| O quê | Superfície | Por quê (duração) |
|---|---|---|
| o esforço (as features do app) | **projeto** | o esforço inteiro |
| cada feature | **card** no projeto, `[S<n>] Agent-loop: <feature>`, `--assignee Implement`, sempre `--no-start` | trabalho com dono; a ordem das features é o `[S<n>]` |
| spec da feature, lista dos checks em palavras, `hash`, branch, estado atual | **corpo** do card, reescrito no início e no fim | verdade atual |
| cada rodada | **comentário**: `agent-loop <slug> #<n> — mantida 5→6/7 · Jev refaz 0,71 · hipótese: … · falharam: c3, c7 · <sha>` | evento datado |
| o relatório e o contrato de monitoramento | **comentário** final; o card vai a `in_review --no-start` | evento; `done` é do humano, depois do merge |
| "Como trabalhar" e os hábitos (v2) | **corpo** de um card fixo do projeto, `Agent-loop: como trabalhar`, espelho do bloco do repo; cada hábito novo, um **comentário** nele com as rodadas que o mostram | a CLI do Multica (`multica --help`, 03/10/2026) não tem superfície de documento: projeto só tem `description` e `resource`. O canônico é o repo (P2) |

- **Quem comenta:** o próprio `agent-loop.mjs rodada`, com `multica issue comment add`. Falha ao
  publicar não falha a rodada: a linha do `rodadas.jsonl` fica com `publicado: false`, e a sessão roda
  `agent-loop.mjs publicar --card <card>` no fim, que sobe os que faltam (idempotente pelo `#<n>`).
- **PII:** o hook `pii-guard` (do MenosJuros) vê o comando `node agent-loop.mjs rodada`, **não** o
  texto que o script publica, e não existe em outros projetos. O `agent-loop.mjs` aplica a mesma régua (CPF, CNPJ, telefone) antes de publicar: troca o trecho por
  `[pii]` e registra no `rodadas.jsonl` que trocou. A hipótese vem do implement e pode trazer massa de
  teste.
- **Projeto sem Multica** (fora do MenosJuros, sem CLI ou sem projeto): o agent-loop roda só com os
  arquivos e diz isso na primeira linha (P6).

## 6. A trava dos checks

Três camadas, e só a primeira depende de permissão:

1. **Regra de deny**, que **o Flávio cola** (edição de permissão não é do agente). No
   `~/.claude/settings.json`, dentro de `permissions`:

   ```json
   "deny": [
     "Edit(**/.agent-loop/*/checks/**)",
     "Edit(**/.agent-loop/*/manifesto.json)"
   ]
   ```

   Se já existe `deny`, acrescente as duas linhas. `Edit(...)` cobre as ferramentas de escrita de
   arquivo do Claude Code; o `**/` no começo vale em qualquer worktree. Confira com `/permissions`
   depois de colar. Como o agent-loop é só Claude (seção 4.6), ela vale para o implement e para o
   `claude -p` do monitoring. **O que ela não cobre:** escrita por Bash (`sed -i`, `>`, `node -e`).
   Por isso ela é a camada mais fraca.
2. **Hash em código.** O `travar` calcula um sha256 sobre `checks/`, os campos `comando`,
   `comando_guarda` e `arquivos` do manifesto, e o bloco "Regras fixas" do `program.md`. O valor vai
   em três lugares fora do alcance do construtor: `args.hash_checks` do workflow, o corpo do card, e o
   commit do `travar`. A cada rodada o script recalcula e devolve; **o workflow compara em código**.
   Diferente → a rodada é desfeita (o reset restaura os checks) e a corrida termina em `violacao`. Não
   é rodada perdida: é sinal de que o `program.md` falhou, e quem decide o que fazer é o humano.
3. **O escopo da rodada.** O script lista os caminhos mudados (`git status --porcelain`) e desfaz a
   rodada que tocou fora de `arquivos` (com prefixo de pasta, como o `dentro()` do laço) — é o "só
   muda um arquivo" do Karpathy, alargado para os arquivos da feature.

Risco que sobra: o implement tem Bash e pode escrever fora do worktree, inclusive no próprio
`agent-loop.mjs`. A defesa é o monitoring calcular `shasum` do script **antes** de rodá-lo, e o
workflow comparar com o da primeira rodada. Não fecha tudo; fica escrito.

## 7. A nota da rodada: checks travados + Jev

### 7.1 A decisão — `decidirRodada`, função pura

Mesma função no `agent-loop.mjs` (que aplica) e no workflow (que confere). Entradas: `hash_ok`,
`fora_do_escopo`, `passam` (os ids dos checks verdes), `passavam` (os do último estado mantido),
`total`, `guarda_ok`, `jev` (`exit`, `probabilidades`, `critico`), `critico`.

| # | Condição, nesta ordem | Decisão | Segue? |
|---|---|---|---|
| 1 | `hash_ok` falso | desfaz | **para**: `violacao` |
| 2 | tocou fora do escopo | desfaz | segue |
| 3 | algum de `passavam` não está em `passam` (regressão), ou `guarda_ok` falso | desfaz, **sem chamar o Jev** | segue |
| 4 | Jev exit `1` (não julgou, depois de 1 nova tentativa) | desfaz (patch salvo) | **para**: `humano`, "não julgado" |
| 5 | Jev exit `0` e `passam` = todos | **mantém** | **fechamento** |
| 6 | Jev exit `0` e faltam checks | trata como `2` (o Jev não passa o que um check reprova) | — |
| 7 | Jev exit `3`, `critico`, a maior probabilidade é `passou` e `passam` = todos | **mantém** | fim: `revisao_humana` |
| 8 | Jev exit `3` | desfaz (patch salvo) | **para**: `humano` |
| 9 | Jev exit `2` e `passam` ⊋ `passavam` (progresso estrito) | **mantém** | segue |
| 10 | Jev exit `2` sem progresso | desfaz | segue |

`--verificar-saida` é a saída dos checks travados mais a do `comando_guarda`. A `--spec-arquivo` é o
corpo do card. O `--diff-arquivo` é `git diff <base>` do worktree, com os não rastreados (o mesmo
passo 2 do laço), **desde a base da feature**, não do branch inteiro.

"Mantém" = `git add -A -- <arquivos>` + `git commit` no branch `agent-loop/<slug>`, com hooks (sem
`--no-verify`; hook que falha vira desfaz com o motivo). "Desfaz" = salva o patch em `descartadas/`,
`git reset --hard <head mantido>` e `git clean -fd` **só no worktree**. O script se recusa a rodar
`reset`/`clean` se a raiz é o checkout principal (`git rev-parse --git-dir` igual a
`--git-common-dir`) ou se o branch não começa com `agent-loop/`. **`git stash` não existe no script**:
o stash é compartilhado entre worktrees.

### 7.2 Por que a linha 9 diverge da proposta "refaz desfaz" (P1)

O `--gate` do Jev julga a **fatia inteira** contra a spec: `passou` quer dizer "pronto". Se `refaz`
desfaz, toda rodada que avança 3 de 7 checks some, e o loop vira **N tentativas independentes da
feature inteira** (melhor de N), não uma catraca. O progresso que se mantém tem de ser medido por algo
que enxerga progresso parcial; o Jev não enxerga (é passou · refaz · humano), os checks enxergam. Por
isso: **os checks dizem se avançou, o Jev diz se acabou e se deve parar.**

### 7.3 O risco de um juiz probabilístico como nota, e a defesa

| Risco | Defesa |
|---|---|
| **Não determinismo:** o mesmo estado pode levar `passou` numa rodada e `refaz` na seguinte; o agent-loop andaria por sorte | o que **mantém** no meio do caminho é mecânico (linha 9); o Jev nunca mantém uma regressão (linha 3 vem antes); o fim passa por um segundo Jev e pelo code-review no fechamento |
| **Goodhart pela narrativa:** o construtor não toca os checks, mas escreve o diff que o Jev lê (nomes, comentários que "declaram" critério) | `passou` só conta com todos os checks verdes (linha 6); regra fixa contra comentário-declaração; o code-review do fechamento lê o diff com outro modelo |
| **O Jev não diz o que falta** (`refaz` sem lista, `decision-gate/SKILL.md`) | o sinal do próximo implement é mecânico (os checks que falharam, com a saída) mais a `observacao` do monitoring |
| **Contexto de 32k:** o `juiz.mjs` corta o diff em 40 mil caracteres e o verificar em 6 mil | diff só desde a base da feature; o script registra `cortado: true`; com corte, o `passou` vale como "todos verdes" e o fechamento é obrigatório (já é) |
| **Fluxo crítico:** o juiz nunca dá `passou` com `--critico` (`juiz.mjs:229`) | linha 7: o fim é `revisao_humana`, nunca `pronto` |
| **O recibo do Jev e o hook de `Stop`:** o `--gate` grava recibo, e o `hook-stop.mjs` pede continuação depois de `refaz` | teste T9: o monitoring da rodada devolve depois de um `refaz` sem ficar preso; se ficar, o script chama o juiz com o recibo desligado (flag nova no `juiz.mjs`, ticket próprio) |
| **Custo:** um Jev por rodada é centavos; o monitoring que o roda é o caro (Fable, mais o salto de Opus da ponte) | critério 2 conta os dois; o teto de 12 e a estagnação em 4 limitam (P4) |

## 8. Desfazer sem estragar trabalho do usuário

- O agent-loop **nunca** roda no checkout do usuário: só no worktree `agent-loop/<slug>`, criado da `HEAD`.
  O trabalho sem commit do usuário fica onde está, intocado.
- Desfazer é `reset --hard` + `clean -fd` **no worktree**, com as duas recusas da seção 7.1. Os
  arquivos ignorados (dependências, build, `rodadas.jsonl`) sobrevivem, porque `clean` sem `-x` não os
  apaga.
- Nada se perde: o diff de toda rodada desfeita fica em `descartadas/rodada-<n>.patch`.
- Os commits por rodada ficam no branch `agent-loop/<slug>`. Levar para o branch de trabalho (merge,
  squash) e abrir PR é da sessão, com o humano. A retomada de um workflow interrompido só é segura se
  o worktree não foi mexido à mão desde então; o `preflight` da retomada confere que `HEAD` é o último
  `mantido` do `rodadas.jsonl`.
- Fechar o worktree é da sessão, depois do merge (`git worktree remove`). O CLAUDE.md do MenosJuros já
  avisa: 44 worktrees esquecidos somavam 7,2 GB.

## 9. Fluxo crítico

- O mesmo `TEMA_CRITICO` dos três workflows (`laco-de-refaz.js`), sobre o objetivo, os critérios, a
  lista dos checks e os `arquivos`, sem o nome do projeto.
- **A sessão não sugere agent-loop para fluxo crítico**: o critério 3 falha por definição.
- Chamada pelo nome em fluxo crítico: sem `autorizar_critico: true`, `estado: 'critico'` com **zero
  agentes**. Autorizada: o Jev roda com `--critico` em toda rodada, e o melhor fim possível é
  `revisao_humana` (linha 7). Nunca `pronto` sozinho.

## 10. A sugestão, sempre com pergunta

- **Onde mora a detecção:** na sessão principal, na primeira decisão do caminho (`agent.md`, a linha
  nova da seção 3). Não é hook nem classificador: a sessão confere os 4 critérios ao ler a tarefa.
- **A pergunta**, quando os 4 valem, na primeira linha da resposta:
  > Isto cabe num agent-loop (loop de construção): repete (…), cabe no orçamento (~N rodadas), dá nota
  > sem humano (…), roda local (…). Quer rodar como agent-loop? Antes de construir, eu te mostro a lista
  > de checks para aprovar. — sim / não, faço pelo laço de refaz
- **Nunca dispara sozinha.** O "sim" autoriza só o começo; os checks têm os dois gates da
  `agent-loop-checks`. Em código: o workflow recusa (`invalido`) sem `hash_checks`, e o hash só existe
  depois do `travar`, que a skill só roda depois do gate 2.
- Chamar `/agent-loop` pelo nome é o "sim"; os gates dos checks continuam.

## 11. Testes — o critério verificável de pronto

**Pronto quando, nesta ordem:**

1. `node --test ~/Sources/agents/claude/workflows/` passa, com `agent-loop.test.mjs` sobre o `.js` real
   pelo `simular.mjs`:
   - **estático**: `meta` literal com `name: 'agent-loop-rodadas'`, `phases` batendo com os `phase()`;
     sem `Date.now`/`Math.random`/`new Date(`/`import`/`require`/`process.`/`workflow(`;
   - `args` sem `hash_checks`, sem `raiz` ou `slug` fora de `[a-z0-9-]` → `invalido`, zero agentes;
   - crítico sem autorização → `critico`, zero agentes;
   - preflight com `git_ok: false` → `sem_git`, zero implements;
   - roteiro mantém, desfaz, mantém com Jev `0` e todos verdes → `pronto` depois do fechamento, com
     `mantidas: 2`, `desfeitas: 1`, e o prompt do 2º implement contém a hipótese e os checks falhos do 1º;
   - Jev `2` com progresso → mantém; Jev `2` sem progresso → desfaz; regressão → desfaz **sem** o
     passo do Jev no JSON; Jev `0` com check vermelho → tratado como `2`;
   - Jev `1` → `humano` "não julgado", nunca `pronto`; Jev `3` → `humano`; Jev `3` crítico com
     `passou` no topo e todos verdes → `revisao_humana`;
   - `hash` devolvido diferente de `args.hash_checks` → `violacao` na hora; sha do script mudando
     entre rodadas → `violacao`; decisão do script diferente da recalculada → `violacao`;
   - 4 desfeitas seguidas → `estagnou`; `rodadas: 3` → no máximo 3 implements; `rodadas: 99` → teto 30;
   - `budget.total` baixo → `orcamento` sem um implement a mais;
   - todo `agent()` com `agentType` de papel e sem `model`/`effort` (o simulador já lança), e todo
     prompt começa com `PAPEIS: PAPEIS_SO=claude --escalada`;
   - implement que volta com `harness: 'cursor'`, ou monitoring sem `--model fable` no
     `execucao.comando` → `harness`, sem rodada a mais.
2a. `node --test ~/Sources/agents/papeis/` passa, com casos novos em `harnesses.test.mjs`:
   `PAPEIS_SO=claude` + `--escalada`, monitoring a partir do Opus → `claude:claude-fable-5-1`,
   `nativo: false`, `comando` com `--model fable`; sem `--escalada` → Opus, como hoje; com o Codex
   permitido e `--escalada` → `codex:gpt-6-sol`, como hoje; os casos existentes intactos.
2. `node --test ~/Sources/agents/skills/agent-loop/scripts/` passa, contra um repo git temporário:
   - `travar` move `rascunho/` → `checks/`, grava manifesto e hash, commita; hash estável; muda com 1
     byte em qualquer check, no `comando`, nos `arquivos` ou nas "Regras fixas";
   - `rodada` mantém (commit novo, `HEAD` avança) e desfaz (árvore igual ao `HEAD` mantido, patch em
     `descartadas/`, `rodadas.jsonl` intacto e com a linha nova);
   - recusa `reset` no checkout principal e em branch sem `agent-loop/`; nenhum `stash` no código (grep);
   - fora do escopo → desfaz; regressão → desfaz sem chamar o juiz (juiz falso conta chamadas);
   - `decidirRodada` dá a tabela da seção 7.1 inteira; o mesmo conjunto de casos, rodado na cópia do
     workflow pelo simulador, dá o mesmo resultado (paridade);
   - PII: hipótese com CPF, CNPJ e telefone sai `[pii]` no comentário; `publicar` duas vezes não
     duplica comentário (Multica falso);
   - `habitos --conferir` falha quando muda algo fora do bloco "Como trabalhar".
3. **T0, de ponta a ponta, uma vez, à mão**, num repo de brinquedo (`fixtures/agent-loop-brinquedo/`:
   uma função a implementar e 5 checks): a corrida termina `pronto`, com ≥1 rodada mantida e ≥1
   desfeita; `git log agent-loop/<slug>` tem só commits de rodadas mantidas e o do `travar`;
   `git diff <travar>..HEAD -- .agent-loop/*/checks` vazio; toda volta do implement declara
   `claude:claude-sonnet-5-5` e toda volta do monitoring traz `execucao.comando` com
   `claude -p --agent monitoring --model fable` e o commit e o reset feitos por ele. Se o `claude -p`
   não conseguir commitar no worktree, a seção 7.1 volta ao reach antes de seguir.
4. T9: o monitoring de uma rodada `refaz` devolve sem o `hook-stop` o prender.
5. `agent.md` com o padrão **agent-loop** e a linha da sugestão; os quatro `claude/agents/*.md` com a
   frase da linha `PAPEIS:` (seção 4.6); `install.sh` sem mudança (os globs já
   cobrem); `bash -n install.sh`.

## 12. Fora de escopo

- `agent-loop-habitos` construída (só o contrato de dados entra agora, P3).
- Rodar várias features numa invocação: a sessão chama o workflow uma vez por feature, na ordem do
  `[S<n>]` dos cards.
- Promover os checks para a suíte normal do projeto (P5).
- Nota contínua (tempo, bundle, memória) no lugar de contagem de checks; dá para acrescentar depois
  pelo mesmo `decidirRodada`.
- Agent-loop dentro das ondas ou do laço; o runtime aninha um nível, e as três unidades não se misturam.
- O loop no Codex e no Cursor como harness da sessão (workflow `.js` é só do Claude Code).
- Colar a regra de deny (é do usuário), commit no branch de trabalho, PR, merge.
- A entrada no MenosJuros (cópia, catálogo, contagem, `agent.md` do projeto): ticket próprio, depois
  do global pronto.

## 13. Perguntas abertas

Cada uma muda o desenho; a recomendação vale se não houver resposta.

1. **`refaz` do Jev com progresso nos checks: mantém ou desfaz?** Você propôs "refaz desfaz". O Jev
   julga a feature inteira, e com "refaz desfaz" todo avanço parcial some e o loop vira melhor de N.
   **Recomendo: mantém quando os checks verdes crescem sem regressão, desfaz quando não crescem; o
   Jev decide o fim (`passou`) e a parada (`humano`).** (seção 7.2)
2. **"Como trabalhar" e os hábitos: canônico no repo ou no Multica?** **Recomendo o repo**
   (`.agent-loop/program.md`), versionado e revisado por diff, com espelho no corpo de um card fixo
   `Agent-loop: como trabalhar`. O implement precisa ler o arquivo sem depender da
   autenticação no Multica, e a CLI do Multica não tem superfície de documento.
3. **A `agent-loop-habitos` (o auto-loop) entra agora ou depois?** **Recomendo depois**: ela só acha
   repetição com 2 features de dados. Agora entra o `rodadas.jsonl` com tudo o que ela vai ler.
4. **O Fable em toda rodada ou só no preflight e no fechamento?** Por rodada, o monitoring roda um
   script e escreve 3 frases, e custa o Fable mais o salto de Opus da ponte. A alternativa é a rodada
   com o monitoring Opus **nativo** (sem `--escalada`, sem ponte) e o Fable só no preflight e no
   fechamento, que é onde se julga. Quem constrói continua sem rodar a nota nos dois casos.
   **Recomendo o Fable em toda rodada, como você decidiu, e medir o custo por rodada no T0**; se
   pesar, a troca é só tirar o `--escalada` do briefing da rodada.
5. **Os checks depois do merge: ficam em `.agent-loop/<slug>/checks/` ou viram testes da suíte?**
   **Recomendo ficar**, e o `comando` do manifesto entrar no `verificar` do projeto: ficam como
   regressão sem perder a trava. Promover para a suíte tira os checks da pasta travada.
6. **Projeto sem Multica: o agent-loop roda só com arquivos ou para?** Você pediu o Multica "sempre que
   se trabalha num projeto". **Recomendo rodar com os arquivos e dizer isso na primeira linha**; com
   card, publica tudo pelo `publicar`.
7. **Commit por rodada mantida, no branch `agent-loop/<slug>` do worktree, é a exceção ao "nenhum padrão
   faz commit"?** É o mecanismo de desfazer do Karpathy (commit mantém, reset desfaz) e a alternativa
   sem commit (patch salvo e reaplicado) é frágil. **Recomendo aceitar a exceção, escrita no
   `agent.md`**: commits só nesse branch, e levar ao branch de trabalho continua sendo da sessão, com
   o humano.

## Decididas em 03/10/2026

O nome é `agent-loop` (não `catraca`). Roda 100% com modelos Claude: implement no Sonnet, monitoring no Fable em toda rodada; a tabela global de `papeis/` só ganha a escalada do monitoring, sem mudar nada fora do `agent-loop`. O multi-harness fica para depois.
O usuário aceitou as recomendações de todas as perguntas:
1. `refaz` com mais checks verdes e sem regressão **mantém** a rodada; sem avanço, desfaz.
2. As regras do loop e os hábitos têm a versão oficial no **repositório**, com espelho num card fixo do Multica.
3. O `agent-loop-habitos` (auto-loop) fica para a **v2**; na v1 entra só o `rodadas.jsonl`.
4. O **Fable em toda rodada**; o custo por rodada é medido no T0.
5. Depois do merge, os checks ficam em `.agent-loop/<slug>/checks/`, e o comando deles entra no `verificar` do projeto.
6. Sem Multica, o loop roda só com os arquivos, dizendo isso na primeira linha.
7. O commit por rodada mantida, só na branch `agent-loop/<slug>` do worktree, vira exceção escrita no `agent.md` à regra "nenhum padrão faz commit".
8. **A nota que aprova é o Jev**, e ele nunca dá `passou` sem a saída dos checks travados, nem com check vermelho.
