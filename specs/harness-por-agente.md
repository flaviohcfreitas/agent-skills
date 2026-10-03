# Spec: harness e modelo por agente, num arquivo só

> Status: rascunho do reach, 03/10/2026. Não construído. As perguntas abertas estão no fim; as
> recomendações valem como decisão se o Flávio não responder diferente.

## 1. Problema

Hoje o harness e o modelo de cada papel (scout, reach, implement, monitoring) estão definidos em
**dois lugares que não conversam**:

1. `claude/skills/orchestri/harnesses.mjs`: `PREFERENCIA` por papel (lista ordenada de
   `{harness, modelo, esforco, provedor}`, e o primeiro disponível ganha), `HARNESSES` (os binários)
   e `comando(c, papel)` (a linha de CLI headless, com sandbox por papel). **Só o workflow
   `orchestri.js` a lê**, e ainda por cópia: o bloco `<plano>` é colado por `sincronizar.mjs`.
2. `claude/agents/{scout,reach,implement,monitoring}.md`: frontmatter `model: haiku | opus | sonnet | opus`.
   São os subagentes nativos do Claude Code e **só rodam modelo Claude**.

Consequências:

- Quem despacha `subagent_type: "scout"` fora da `/orchestri` ganha o Haiku, embora a tabela diga
  que o scout padrão é o GPT-6 Luna no Codex. O mesmo com o implement (Sonnet em vez do Grok 4.7) e o
  monitoring (Opus em vez do GPT-6 Sol).
- Codex e Cursor têm uma **terceira** e uma **quarta** tabela, nas skills `agent-models`, e a
  `multica` tem uma **quinta** (a coluna "Modelo", que já diverge: diz Fable 5.1 no reach).
- A `/orchestri` vai ser apagada, e com ela sumiria a única leitura da tabela.

## 2. Decisão

- **A tabela sai da `/orchestri` e vira um módulo próprio, junto dos agentes**, instalado num
  caminho que os três harnesses alcançam.
- **Cada agente a lê antes de trabalhar.** O padrão roda no harness onde o agente já está → o agente
  faz o trabalho. O padrão é outro harness (Codex, Cursor, Grok; OpenCode quando entrar) → o agente é
  a **ponte**: chama a CLI headless daquele harness com o briefing e devolve o resultado, com prova
  de execução. Harness ausente ou que falhou → cai para o próximo candidato, **dito em voz alta**.
- **A ponte não monta a linha de CLI nem decide o fallback**: o módulo faz as duas coisas em código,
  com teste (lição do 27/09/2026: o encanamento em prosa saiu errado, e a ponte fez o trabalho no lugar
  do Grok quando a permissão bloqueou a CLI).
- **A `/orchestri` morre inteira**, menos o que está na seção 8.

## 3. Onde a tabela mora

| | |
|---|---|
| Fonte | `~/Sources/agents/papeis/harnesses.mjs` (vem por `git mv` de `claude/skills/orchestri/harnesses.mjs`, para o `blame` seguir) |
| Teste | `~/Sources/agents/papeis/harnesses.test.mjs` (idem, de `harnesses.test.mjs`) |
| Instalado em | `~/.agents/papeis/` → symlink para `$REPO/papeis`, criado pelo `install.sh` |
| Quem lê | os quatro `claude/agents/*.md`, as duas `agent-models` (Codex, Cursor), e qualquer sessão que queira saber "quem roda o papel X aqui" |

**Formato: um módulo ESM `.mjs`, sem dependência, e não um JSON.** O `comando()` é código com teste, e
a tabela e o comando têm de mudar juntos; separá-los em dois arquivos quebraria o "um arquivo só".
Quem não é Node lê pela CLI, que imprime JSON.

O módulo exporta:

- `HARNESSES` — `{ claude, codex, cursor, grok }` com o `bin` de cada (o Cursor é `cursor-agent`,
  nunca `agent`: o Grok instala um `agent` próprio).
- `PREFERENCIA` — a tabela de hoje, **sem mudar um candidato** (ver P3 sobre a ordem do reach e do
  monitoring). Os campos `escalada` (reach), `requer` e `monitoring` (o par Sol + Fable do implement)
  continuam.
- `ALIAS` — `claude-haiku-4-5 → haiku`, `claude-sonnet-5-5 → sonnet`, `claude-opus-5-5 → opus`,
  `claude-fable-5-1 → fable` (hoje mora em `orchestri.js`).
- `comando(c, papel)` — o de hoje, mais o caso `claude` não nativo (seção 4.3).
- `detectar()` — o de hoje (`command -v <bin>`).
- `resolver(papel, opcoes)` — novo; substitui o `planejar()` (seção 4.2).
- `rodar(papel, opcoes)` — novo; resolve, executa a CLI e prova (seção 4.4).

## 4. Como o agente decide e chama a CLI

### 4.1 A CLI do módulo

```
node ~/.agents/papeis/harnesses.mjs resolver <papel> --aqui <harness>[:<modelo>]
     [--construtor <harness>:<modelo>] [--excluir <harness>:<modelo>,...] [--escalada]
node ~/.agents/papeis/harnesses.mjs rodar <papel> --aqui ... [mesmas opções] --briefing <arquivo | ->
     [--teto <minutos, padrão 30>] [--cwd <dir>]
node ~/.agents/papeis/harnesses.mjs --disponiveis
```

- `--aqui` diz **onde o agente já está**. O subagente do Claude Code passa `claude:<o ID exato do
  modelo dele>` (o Claude Code o injeta no prompt: "The exact model ID is …"). A sessão do Codex
  passa `codex` e a do Cursor `cursor`, sem modelo: lá o subagente nativo nasce com o modelo que se
  pedir.
- `--construtor` só no monitoring: o `harness:modelo` de quem construiu, que o implement passa a
  declarar no handoff dele.
- `--excluir`: candidatos que já falharam nesta rodada.
- Restrição a um subconjunto de harnesses (o `--claude`/`--codex` da orchestri): pela variável
  `PAPEIS_SO=claude,codex` (ver P5). Harness pedido e não instalado continua erro alto.

`resolver` imprime JSON:

```json
{ "papel": "scout", "harness": "codex", "modelo": "gpt-6-luna", "esforco": "medium", "provedor": "openai",
  "nativo": false, "comando": ["codex", "exec", "..."],
  "caiu": [], "aviso": null }
```

Exit `0` com um escolhido; exit `1` com a mensagem quando nenhum candidato serve, papel ou opção
desconhecidos.

### 4.2 A regra de escolha (`resolver`)

Percorre `PREFERENCIA[papel]` em ordem e pula o candidato, registrando o motivo em `caiu`, quando:

1. o harness não está em `detectar()` (**ausente**), ou fora de `PAPEIS_SO`;
2. está em `--excluir` (**falhou nesta rodada**);
3. tem `requer` e o harness exigido não está disponível (o Sol só constrói com o Claude para conferir);
4. **implement**: não existe monitoring disponível com modelo diferente dele (regra de hoje: implement
   só entra com quem o confira);
5. **monitoring**, com `--construtor`: tem o mesmo modelo do construtor. A preferência é, em ordem:
   o par declarado no candidato do construtor (Sol → Fable), depois outro provedor, depois outro
   modelo do mesmo provedor (com `aviso`). Sem `--construtor`, resolve pela lista e avisa
   "sem construtor: provedor não conferido".

`nativo` é `true` quando o escolhido roda no harness `--aqui` **e** (o `--aqui` não traz modelo, ou o
modelo é o mesmo). Claude com outro modelo (o Opus que precisa do Fable) **não** é nativo: vai pela
CLI do `claude` (4.3).

`--escalada` (só reach) troca o modelo do candidato Claude pelo campo `escalada` (Fable 5.1).

**Guarda contra recursão.** Com `PAPEL_DESTINO=1` no ambiente, `resolver` devolve `nativo: true` sem
consultar a tabela. O `rodar` põe essa variável no processo filho **e** abre o briefing com a linha
`PAPEL_DESTINO: você é o destino do papel <papel>; faça o trabalho, não redespache.` — as duas, porque
o sandbox do Codex pode filtrar o ambiente, e o `claude -p --agent <papel>` carregaria o mesmo `.md`
que mandou resolver.

### 4.3 O comando por harness, e o sandbox por papel

O briefing entra por arquivo (`{briefing}`). Os de Codex, Cursor e Grok ficam **exatamente** como estão
hoje e os testes atuais continuam valendo:

| Harness | scout · reach (só leem) | implement (escreve) | monitoring (verifica: shell, tmp, rede) |
|---|---|---|---|
| `codex` | `codex exec -m <m> [-c model_reasoning_effort=<e>] -s read-only --skip-git-repo-check - < {briefing}` | idem com `-s workspace-write` | `-s workspace-write -c sandbox_workspace_write.network_access=true` |
| `cursor` | `cursor-agent -p --trust --output-format text --model <m> --mode ask "$(cat {briefing})"` | idem com `--force` no lugar de `--mode ask` | idem, `--force` |
| `grok` | **proibido** (não há modo só-leitura no comando de hoje; ver invariante 4 nos testes) | `grok -m <m> --always-approve --prompt-file {briefing}` | idem |
| `claude` nativo | `null` — o agente faz o trabalho | `null` | `null` |
| `claude` não nativo (**novo**) | `claude -p --agent <papel> --model <m> [--effort <e>] --permission-mode plan --permission-prompts none < {briefing}` | `… --permission-mode acceptEdits --allowedTools Bash --permission-prompts none` | `… --permission-mode dontAsk --allowedTools "Read Grep Glob Bash" --permission-prompts none` |

- `--grok`: `--prompt-file` e `-p` são excludentes; o briefing entra só pelo arquivo (teste de hoje).
- As flags do `claude` foram lidas em `claude --help` nesta máquina em 03/10/2026 (`--agent`,
  `--permission-mode` com `plan | acceptEdits | dontAsk | …`, `--permission-prompts none`,
  `--effort`, `--allowedTools`). O implement confere de novo antes de fixar o array no teste.
- O reach externo **só lê**, como hoje: devolve a spec como texto, e quem grava é o chamador.
- "O monitoring não conserta" continua regra do prompt dele, não do sandbox.

### 4.4 A ponte (`rodar`)

`rodar` faz, em código, o que a ponte Haiku da `orchestri.js` (linhas 270–300) fazia em prosa:

1. resolve (4.2); se `nativo`, devolve `{ nativo: true, ... }` sem executar nada;
2. grava o briefing (vindo de arquivo ou de stdin) num temporário, prefixado com a linha
   `PAPEL_DESTINO`;
3. no implement, guarda `git status --porcelain` do `--cwd`;
4. executa `comando` com `PAPEL_DESTINO=1`, saída inteira num arquivo de log, com teto de
   `--teto` minutos (mata o processo ao estourar);
5. falhou (exit ≠ 0, saída vazia, timeout) → **cai para o próximo candidato** (exclui o que falhou e
   resolve de novo), registrando em `caiu`. **No implement, só cai se o `git status --porcelain` for o
   mesmo de antes**; se a CLI escreveu e falhou, para e devolve `falha_harness` (ninguém constrói por
   cima de uma árvore meio escrita);
6. imprime JSON com o escolhido, `caiu`, `aviso` e a **prova**:
   `execucao: { comando, exit, log, fim_da_saida }` (as últimas ~40 linhas).

Chegando a um candidato `claude` nativo depois de cair, `rodar` devolve `nativo: true` com o `caiu`
preenchido: aí o agente faz o trabalho ele mesmo, e isso é o fallback legítimo, não a ponte mentindo.

### 4.5 O que cada agente faz (a seção nova dos `.md`)

Todos os quatro `claude/agents/*.md` ganham a mesma seção curta, no topo:

1. **`PAPEL_DESTINO` no briefing ou no ambiente?** Você é o destino: pule para o trabalho.
2. Rode `node ~/.agents/papeis/harnesses.mjs resolver <papel> --aqui claude:<seu ID de modelo>`
   (monitoring: mais `--construtor <harness:modelo do implement>`; reach com `to-map`: mais
   `--escalada`, ver P6).
3. `nativo: true` → faça o trabalho.
4. `nativo: false` → você é a **ponte**. Rode `rodar` com o briefing que recebeu, inteiro, por stdin
   (heredoc), **em background** (o Bash tem teto de 10 min) e espere o fim. **Proibido fazer o
   trabalho no lugar do harness.** Transcreva a saída no formato de volta do seu papel. Se o `rodar`
   devolver `nativo: true` depois de cair, faça o trabalho.
5. **A primeira linha da volta é sempre**: `harness: <h> · modelo: <m> · caiu: <motivos ou —>`, e
   na ponte, a `execucao` (comando, exit, fim da saída). Sem prova, a volta é falha, não resultado.

O `implement.md` passa a declarar no handoff o `harness:modelo` que construiu (vai para o
`--construtor` do monitoring). O `scout.md` e o `monitoring.md` mantêm "não edita arquivo": o único
arquivo que nasce é o temporário que o próprio `rodar` grava.

**Frontmatter `model:` = o primeiro candidato Claude do papel** (o fallback final e o modelo nativo).
Fica como está hoje (haiku · opus · sonnet · opus), e um teste amarra os dois (seção 7). O
`effort:` do frontmatter, quando a tabela tem `esforco` não nulo para esse candidato, tem de bater.

## 5. Fallback

- A ordem é a de `PREFERENCIA[papel]`. Ausente, fora de `PAPEIS_SO`, `requer` não atendido, sem par
  de conferência, ou falhou na hora → próximo.
- **Dito em voz alta, sempre:** `caiu` e `aviso` vão na primeira linha da volta do agente, e a
  sessão repete ao usuário.
- **Todo papel tem um candidato Claude**, e no Claude Code ele nunca falta: lá, a resolução de
  qualquer papel nunca termina em erro. Fora do Claude Code (Codex, Cursor sem o `claude` instalado),
  os candidatos depois do Claude ainda servem; acabou a lista, é erro alto com o motivo de cada queda.
- A antiga `reserva` da orchestri (o Grok falha na hora → Sol constrói, Fable confere) vira esse
  mesmo fallback: o implement exclui o Grok que falhou, `resolver` chega no Sol (que `requer` o
  Claude) e o monitoring, com `--construtor codex:gpt-6-sol`, chega no Fable pelo par.

## 6. O que muda em cada arquivo

Repositório `~/Sources/agents`. ⚠️ `agent.md` e várias skills têm **mudança do Flávio sem commit**:
o implement edita só os trechos abaixo, sem reformatar, e não commita nada alheio.

| Arquivo | Mudança |
|---|---|
| `papeis/harnesses.mjs` (novo, por `git mv`) | Tira o bloco `<plano>`/`</plano>` e o `planejar()`. Mantém `HARNESSES`, `PREFERENCIA`, `comando()`, `detectar()`. Ganha `ALIAS`, o caso `claude` não nativo em `comando()`, `resolver()`, `rodar()`, `PAPEL_DESTINO`, `PAPEIS_SO` e a CLI da seção 4.1. O comentário de topo leva as lições que sobrevivem (seção 8). |
| `papeis/harnesses.test.mjs` (novo, por `git mv`) | Seção 7. |
| `claude/skills/orchestri/` | **Apaga** `SKILL.md`, `orchestri.js`, `sincronizar.mjs` (e a pasta, depois do `git mv` dos dois arquivos). |
| `skills/orchestri` | Apaga o symlink (não rastreado). |
| `install.sh` | Liga `~/.agents/papeis` → `$REPO/papeis` (mesmo padrão do `link_skill`: não sobrescreve, avisa conflito). Não mexe nos links quebrados de usuário; o README diz como limpar `~/.claude/skills/orchestri`. |
| `claude/agents/scout.md` · `reach.md` · `implement.md` · `monitoring.md` | A seção 4.5. Frontmatter sem mudança. |
| `agent.md` | (a) Parágrafo de abertura: "O agente decide o harness e o modelo — no Claude Code a tabela é da `orchestri`, no Codex e no Cursor é da `agent-models`" → "O harness e o modelo de cada papel estão num arquivo só, `~/.agents/papeis/harnesses.mjs`, e os quatro agentes o leem em qualquer harness." (b) Tabela "A primeira decisão", linha **complexa**: tira "(a `/orchestri`)"; o ciclo inteiro passa a ser a sessão encadeando os quatro papéis, um handoff por vez (P1). (c) "Despachar pelo papel": a coluna "Que já vem com" diz o papel e as skills, e "o harness e o modelo de `harnesses.mjs`"; os dois bullets "No Claude Code… a `orchestri` tem a tabela" e "No Codex e no Cursor… `agent-models`" viram um só: todo agente roda `harnesses.mjs resolver` antes de trabalhar, e o padrão em outro harness vai pela CLI dele; mais uma linha com a regra de fallback (seção 5). (d) "Os dois modos": sai a linha `/orchestri`; o modo é só passo a passo (P1). |
| `README.md` | O parágrafo "Codex e Cursor têm a skill `agent-models`… a skill `orchestri` é a tabela e o grafo…" e a tabela por harness viram: a tabela mora em `papeis/harnesses.mjs`, e as `agent-models` só dizem como delegar em cada harness. Uma linha sobre `~/.agents/papeis` em "Instalar", e como remover o link `~/.claude/skills/orchestri`. |
| `codex/skills/agent-models/SKILL.md` | A tabela "Os quatro papéis" (modelo, esforço) sai; entra "o modelo de cada papel é `harnesses.mjs resolver <papel> --aqui codex`: `nativo` → spawn nativo com `modelo` e `esforco`; senão, `rodar`". Sai "Mandar trabalho para Claude Code ou Cursor é a skill `orchestri`, e só quando o usuário a chama" (ver P2). Fica o resto (quando delegar, briefing, Jev, integração). |
| `cursor/skills/agent-models/SKILL.md` | Igual: a tabela e "No Cursor usamos só Composer e Grok… via `orchestri`" saem; "para trabalho crítico, peça o monitoring de outro harness pela `orchestri`" vira "o `--construtor` já garante o monitoring de outro provedor". |
| `skills/multica/SKILL.md` | Itens 2 de "Todo agente tem um papel" e o "os mesmos quatro da `orchestri`": harness e modelo saem de `harnesses.mjs resolver <papel>`. A coluna "Modelo" da tabela "Qual agente cada ticket leva" sai (era uma quinta tabela, já divergente). |

**Fora deste repositório, num PR à parte do MenosJuros** (não é escopo desta spec construir, mas a
`/orchestri` sumindo deixa referência morta): `agent.md` (linhas 7, 59, 104, 115), `CLAUDE.md:112`
("a `/orchestri`, desde 27/09/2026", no gate do PR), `.claude/skills/multica/SKILL.md:131-143`, e
`.claude/specs/classificador-de-dominio.md` (linhas 93, 239, 351, 353, 366), que fala da `/orchestri`
como saída do papel **ciclo**.

### O `despachar.mjs` do MenosJuros: **fica separado** (recomendação)

`scripts/harness/despachar.mjs` também monta CLI de outros harnesses, mas resolve outra pergunta:

- **Outro eixo.** Ele escolhe *runner* (modelo + coleira) pelo quadrante da MOM (`NECESSIDADES`:
  `surgeon`, `judge`, `research`…) e pelo **destino** (`--onde local | claude | cursor | vm |
  vm-claude | cursor-web`: worktree, VM do Railway, agente web). O `harnesses.mjs` escolhe por papel,
  na árvore atual.
- **Outro dono e outro público.** Ele é versionado no monorepo e roda na máquina de qualquer dev do
  time; `~/Sources/agents` é a instalação pessoal do Flávio. Importar um do outro quebraria o
  `npm run despachar` de quem não tem o repositório pessoal.
- **Outro contrato.** Lê consumo do `--output-format json`, cria worktree, tem interruptores
  `RUNNER_*` por CLI e regras próprias (o `grok-review` precisa de `--force --sandbox enabled` para
  rodar `git diff`). O que os dois compartilham são três ou quatro flags de CLI.
- **O `workflow domain-doc` depende dele** (`domain-doc.js:416`, `--runner grok-review`), e a
  observação de 03/10/2026 manteve o script quando os comandos `/despachar` e `/contexto` saíram.

O risco real é **ID de modelo divergente**, e já existe: o `despachar` usa `cursor-grok-4.6-high-fast`
(medido em 09/09/2026) e o `domain-doc` chama o Sol como `gpt-5.6-sol-high` via Cursor; a tabela
global diz `grok-4.7-high` e `gpt-6-sol`. Isso é um ticket do MenosJuros (um teste que confere os IDs
do `RUNNERS` contra `cursor-agent --list-models`, como a tabela global já faz), fora desta spec.

## 7. Testes — o critério verificável de pronto

**Pronto quando, nesta ordem:**

1. `node --test ~/Sources/agents/papeis/harnesses.test.mjs` passa, com:
   - **`comando()` — todos os testes de hoje, inalterados** (grok excludente, codex read-only /
     workspace-write / rede no monitoring, cursor `ask` × `--force`, Claude nativo `null`), e o teste
     da lista de IDs do Cursor.
   - **`comando()` do `claude` não nativo**: scout e reach com `--permission-mode plan`; implement com
     `acceptEdits`; monitoring sem `Edit`/`Write`; todos com `--agent <papel>` e `--model`.
   - **`resolver()`**, com `detectar` injetado:
     - todos os harnesses, `--aqui claude:claude-haiku-4-5`: scout → `codex:gpt-6-luna`, `nativo: false`, comando `read-only`;
     - reach, `--aqui claude:claude-opus-5-5`: `nativo: true`;
     - reach `--escalada`, `--aqui claude:claude-opus-5-5`: `claude:claude-fable-5-1`, `nativo: false`, comando `claude -p --agent reach`;
     - implement, todos: `cursor:grok-4.7-high`; com `--excluir cursor:grok-4.7-high`: `grok:grok-4.7`;
     - implement só `claude`+`codex`: `codex:gpt-6-sol`; só `codex`: `codex:gpt-6-luna`;
     - monitoring `--construtor cursor:grok-4.7-high`: `codex:gpt-6-sol`; `--construtor codex:gpt-6-sol` com o Claude: `claude:claude-fable-5-1`; `--construtor claude:claude-sonnet-5-5` só com `claude`: `claude:claude-opus-5-5` com `aviso` de mesmo provedor;
     - **invariante 1**: para todo papel e todo subconjunto de `{codex, cursor, grok}` somado ao `claude`, com `--aqui claude:<modelo do frontmatter>`, `resolver` nunca lança;
     - **invariante 2**: monitoring nunca sai com o modelo do `--construtor`;
     - `PAPEIS_SO=codex` numa máquina sem codex: erro alto "não instalado"; papel desconhecido: erro;
     - `PAPEL_DESTINO=1`: `nativo: true`, sem consultar `detectar`.
   - **Invariantes da tabela**: (3) toda lista de `PREFERENCIA` tem um candidato `claude`;
     (4) scout e reach não têm candidato `grok`; (5) o `model:` do frontmatter de cada
     `claude/agents/<papel>.md`, via `ALIAS`, é o modelo do primeiro candidato Claude daquele papel, e
     o `effort:` bate quando a tabela tem `esforco`.
   - **`rodar()`**, na costura mais alta (a CLI, com `PATH` apontando para binários falsos num
     diretório temporário e um repositório git descartável):
     - o falso `codex` sai com 1 → cai para o próximo; `caiu` tem o motivo; `execucao.exit` do escolhido é 0;
     - o falso `cursor-agent` do implement escreve um arquivo e sai com 1 → **não cai**, devolve `falha_harness`;
     - o filho recebe `PAPEL_DESTINO=1` e o briefing começa com a linha `PAPEL_DESTINO`;
     - teto estourado mata o filho e conta como falha;
     - caiu até o Claude nativo → `nativo: true` com `caiu` preenchido.
2. `grep -rn "orchestri" ~/Sources/agents --exclude-dir=.git --exclude-dir=graft --exclude-dir=specs`
   não acha nada.
3. Depois de `./install.sh`: `~/.agents/papeis/harnesses.mjs` existe, e
   `node ~/.agents/papeis/harnesses.mjs resolver scout --aqui claude:claude-haiku-4-5` imprime
   `codex` nesta máquina (codex, cursor-agent e grok instalados; conferido em 03/10/2026).
4. **Fumaça manual no Claude Code**, uma vez: `Agent(subagent_type: "scout", "diga em que harness
   rodou e responda OK")` volta com a primeira linha `harness: codex · modelo: gpt-6-luna` e uma
   `execucao` com exit 0; o mesmo com `PAPEIS_SO=claude` volta `harness: claude · modelo:
   claude-haiku-4-5 · caiu: codex (fora de PAPEIS_SO), cursor (fora de PAPEIS_SO)`.

## 8. O que da `/orchestri` sobrevive, e o que morre

**Sobrevive**, em `papeis/`:

- `harnesses.mjs`: `HARNESSES`, `PREFERENCIA` (inteira), `comando()`, `detectar()`; o `ALIAS` de
  `orchestri.js`.
- `harnesses.test.mjs`: os testes de `comando()`, do `detectar()` (`cursor-agent`, não `agent`) e da
  lista de IDs do Cursor. Os testes de `planejar()` viram testes de `resolver()` com as mesmas
  expectativas de par (Sol + Fable, outro provedor, Grok pela CLI própria).
- As lições, no comentário de topo do módulo: a ponte prova a execução e nunca faz o trabalho no
  lugar; `cursor-agent`, não `agent`; `--prompt-file` e `-p` do Grok são excludentes; o ID do Grok
  no Cursor é `grok-4.7-high`; harness e modelo são da tabela, falha de runner não é lacuna de spec;
  CLI externa que escreve ou tem rede precisa de permissão liberada na sessão (P4).

**Morre**: `SKILL.md`, `orchestri.js` (o grafo, a porta do Jev grande/pequena, as ondas, os painéis
do Herdr para grilling e protótipo, o gauntlet adversarial, o nó `pr` que abria o PR no `passou`),
`sincronizar.mjs` e o teste que conferia o bloco `<plano>`, o `planejar()` com o plano dos quatro
papéis de uma vez, e a `reserva` (vira fallback, seção 5).

## 9. Fora de escopo

- Reescrever o grafo da orchestri em outro lugar, ou um novo modo "ciclo inteiro num comando" (P1).
- OpenCode como harness: nenhum candidato o usa hoje. Entrar é uma linha em `HARNESSES`, um `case` em
  `comando()` com o sandbox por papel e o teste dele.
- Mudar qualquer candidato, modelo ou esforço da `PREFERENCIA`.
- Unificar com o `despachar.mjs` do MenosJuros, e corrigir os IDs divergentes dele (seção 6).
- As referências à `/orchestri` dentro do MenosJuros (PR à parte, seção 6).
- Mudar permissões ou `settings.json` (P4 é pergunta, não construção).
- Agentes do Multica: o runtime deles continua configurado no Multica; só o texto da skill aponta
  para a tabela nova.

## 10. Perguntas abertas

**P1. Sem a `/orchestri`, a tarefa "complexa" roda como?**
Recomendação: a sessão encadeia scout → reach → implement → monitoring passo a passo, cada agente
resolvendo o próprio harness; o `agent.md` perde a linha `/orchestri` de "Os dois modos" e fica só
"passo a passo". Um grafo novo, se voltar, é outra spec.

**P2. Codex e Cursor passam a mandar papel para outro harness sem o usuário pedir?**
Hoje as `agent-models` dizem "tudo fica dentro do Codex/Cursor; cruzar é a `orchestri`, só quando o
usuário a chama". A decisão "os agentes respeitam a tabela em qualquer harness" muda isso.
Recomendação: sim, cruzam pela tabela, como no Claude Code, e dizem em voz alta; quem quer ficar num
harness só usa `PAPEIS_SO=codex`.

**P3. "O último é sempre Claude": literal, ou "todo papel tem Claude"?**
Na tabela de hoje o reach termina em `cursor:grok-4.7-high` e o monitoring também, depois do Claude.
No Claude Code esses candidatos nunca são alcançados (o Claude está sempre lá); só servem ao Codex e
ao Cursor sem o `claude` instalado. Recomendação: manter as listas, com a invariante "todo papel tem
um candidato Claude, e no Claude Code a resolução nunca falha" (testes 1 e 3), em vez de cortar o fim
das listas.

**P4. Liberar a permissão das CLIs externas para os subagentes?**
A orchestri registrou que `codex exec -s workspace-write`, `cursor-agent --force` e `grok
--always-approve` são bloqueados pela permissão de "agentes inseguros" quando um subagente os roda.
Com o `rodar`, a sessão só vê `node ~/.agents/papeis/harnesses.mjs rodar …`. Recomendação: uma regra
de allow para esse único comando em `~/.claude/settings.json`, feita por você; sem ela, o implement e o
monitoring caem para o Claude a cada chamada, ditos em voz alta, mas nunca no padrão.

**P5. Como restringir harness sem as flags `--claude`/`--codex` da orchestri?**
O `Agent` do Claude Code não passa flag ao subagente. Recomendação: variável `PAPEIS_SO`
(`export PAPEIS_SO=claude` na sessão), lida pelo `resolver`.

**P6. Quem aciona a escalada do reach para o Fable?**
Na orchestri era a porta do Jev ("grande"). Recomendação: a sessão passa `model: "fable"` no `Agent`
quando o trabalho é `to-map`, e o reach chega com `--aqui claude:claude-fable-5-1 --escalada`, que
resolve nativo; sem CLI aninhada.

**P7. A ponte do monitoring roda no Opus.**
O padrão do monitoring é o Sol no Codex, e o subagente que faz a ponte é o Opus do frontmatter (o
fallback Claude). A ponte gasta pouco (um `resolver`, um `rodar`, a transcrição), mas é Opus.
Recomendação: aceitar; a alternativa (frontmatter Haiku e o Opus pela CLI `claude -p` no fallback)
paga uma sessão Claude aninhada justo no caso de falha.

**P8. A pasta: `papeis/` na raiz, ou literalmente ao lado dos `.md` em `claude/agents/`?**
Recomendação: `papeis/` na raiz, instalada em `~/.agents/papeis`, porque Codex e Cursor também a
leem e `claude/` diz "só Claude Code".

## Decididas em 03/10/2026

O usuário delegou a decisão ("as decisões pode decidir"). Valem as recomendações das 8 perguntas:

1. Sem a `/orchestri`, a sessão percorre o caminho no grafo (o `agent.md` virou grafo em 03/10/2026); o modo `/orchestri` sai do `agent.md`.
2. Codex e Cursor mandam papel para outro harness pela tabela, dito em voz alta; `PAPEIS_SO` restringe.
3. As listas ficam; o teste garante que todo papel tem candidato Claude e que no Claude Code a resolução nunca falha.
4. A regra de allow para `node ~/.agents/papeis/harnesses.mjs rodar` é do Flávio, em `~/.claude/settings.json`. O implement **não** edita settings; documenta a linha a acrescentar.
5. `PAPEIS_SO=claude,codex` restringe harness.
6. A sessão passa `model: "fable"` ao reach quando o trabalho é `to-map`.
7. O monitoring vira ponte no Opus quando o padrão dele é externo.
8. A tabela mora em `papeis/` na raiz do repositório.
