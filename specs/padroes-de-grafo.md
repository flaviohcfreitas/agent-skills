# Spec: três padrões de grafo em código — laço de refaz, ondas, adversarial

> Status: rascunho do reach, 03/10/2026. Não construído. As perguntas abertas estão no fim; as
> recomendações valem como decisão se o Flávio não responder diferente.

## 1. Problema

O `agent.md` vai ganhar um catálogo de **8 padrões de grafo** sobre os quatro agentes (leque, até
secar, névoa, diagnóstico, laço de refaz, ondas, painel, adversarial). Cinco ficam texto, que a sessão
segue com o `Agent`. Três têm controle de fluxo que **não deve ficar na mão de um modelo** — contar
voltas, montar ondas pela dependência, contar votos —, e viram workflow dinâmico do Claude Code.

Hoje esse controle mora só na `/orchestri` (`claude/skills/orchestri/orchestri.js`, commit `ae477bb`),
que está sendo apagada. Ela fazia tudo num grafo de 763 linhas (porta do Jev, painéis do Herdr,
mapa, spec, tickets, ondas, gauntlet, PR). O que serve dela, e só isso, vem para cá: as ondas
(`ondas()`, linhas 394–413), o laço por ticket (`ticket()`, 417–457), a ponte do Jev (`julgar()`,
571–588) e a trava de tema crítico (`TEMA_CRITICO`, 261–262).

## 2. Decisão

- **Três workflows, um por padrão**: `laco-de-refaz`, `ondas`, `adversarial`. Cada um é pequeno,
  roda sozinho, e devolve um objeto à sessão.
- **O ciclo inteiro não é um quarto workflow: é composição feita pela sessão** — leque (scouts, pelo
  `Agent`) → reach (`to-spec` e `to-tickets`, pelo `Agent`) → `Workflow({ name: 'ondas' })`. As
  perguntas do reach voltam ao usuário entre um passo e outro, como hoje no modo passo a passo.
- **`ondas` chama `laco-de-refaz` por `workflow()`**, um por ticket. É o único aninhamento, e é o
  máximo que o runtime permite (um nível: `workflow()` dentro do filho lança erro). Por isso:
  - `laco-de-refaz` **nunca** chama `workflow()`;
  - `adversarial` **não** entra no laço nem nas ondas: a sessão o chama sozinho;
  - `ondas` não pode ser chamado por `workflow()` de outro workflow — só pela sessão.
- **Os workflows chamam o agente pelo papel e nunca escolhem modelo.** Todo `agent()` leva
  `agentType: 'scout' | 'reach' | 'implement' | 'monitoring'` e **não** leva `model` nem `effort`.
  O agente decide sozinho se trabalha ali ou vira ponte para outra CLI
  (`specs/harness-por-agente.md`, `papeis/harnesses.mjs resolver`).
- **Regra que protege dinheiro fica em código**: a trava de fluxo crítico, a contagem de voltas, o
  veredito a partir do exit code do Jev e a contagem de votos são funções puras dentro do script,
  nunca prosa no prompt.
- **Nenhum workflow commita, abre PR, move card ou escreve fora dos arquivos do ticket.** O que
  volta é estado + arquivos + veredito; commit e PR são da sessão, sob o gate humano (P1).

## 3. Onde moram

| | |
|---|---|
| Fonte | `~/Sources/agents/claude/workflows/laco-de-refaz.js` · `ondas.js` · `adversarial.js` |
| Testes | `~/Sources/agents/claude/workflows/simular.mjs` (o simulador) e `padroes.test.mjs` |
| Instalado em | `~/.claude/workflows/<nome>.js` → symlink **por arquivo** para a fonte, criado pelo `install.sh` |
| Quem chama | a sessão (`Workflow({ name })`), em qualquer projeto; `ondas` chama `laco-de-refaz` |

- **`claude/workflows/`, não `papeis/`**: workflow `.js` só roda no Claude Code; `papeis/` é lido
  pelos três harnesses. É o mesmo critério de `claude/agents/`.
- **Link por arquivo, não da pasta inteira**: `~/.claude/workflows/` pode ter workflows do usuário que
  não estão no repositório. O `install.sh` ganha um laço igual ao dos agentes (linhas 63–70: pula link
  certo, não sobrescreve arquivo real, avisa conflito), sobre `claude/workflows/*.js` — o glob `*.js`
  deixa o `simular.mjs` e o teste de fora.
- **Nome sem colisão no projeto**: o registro por nome lê `~/.claude/workflows/` e o
  `.claude/workflows/` do projeto, e **na colisão vence o mais perto do diretório de trabalho** — o do
  projeto (changelog do Claude Code, `~/.claude/cache/changelog.md`, 2.1.287+: "the agent, workflow,
  and output-style closest to the working directory now wins when names collide"). O MenosJuros tem
  `domain-doc`, `executar-mapa` e `migrate-to-backv2`; nenhum dos três nomes novos colide. Que o
  symlink é seguido ainda não está confirmado (seção 10).

## 4. Os contratos comuns

### 4.1 O ticket (entrada de `laco-de-refaz` e de `ondas`)

É o mesmo `TICKET` da `orchestri` e o que a `to-tickets` devolve:

```js
{ id: 'T1', objetivo: '...', arquivos: ['src/a.ts', 'src/a.test.ts'], criterio_pronto: ['...'], depende_de: ['T0'] }
```

`id`, `objetivo`, `arquivos` (não vazio) e `criterio_pronto` (não vazio) são obrigatórios;
`depende_de` é opcional. Os `arquivos` são **exclusivos**: incluem os testes que o ticket escreve.

### 4.2 Validação de entrada, sem gastar agente

Entrada inválida não lança: devolve `{ estado: 'invalido', motivos: [...] }` antes de qualquer
`agent()`. Assim a sessão lê o motivo no mesmo formato de todo retorno.

### 4.3 A trava de fluxo crítico

`critico(ticket, args) = args.critico === true || TEMA_CRITICO.test(texto)`, onde `texto` é
`objetivo + criterio_pronto + arquivos`, sem o nome do projeto (`/menos[-_ ]?juros/gi` sai antes, como
na `orchestri`). O regex é o da `orchestri`, linha 261:

```js
/cr[eé]dito|parcela|pagamento|d[eé]bito|cobran[çc]a|juros|cadastro|autentica|login|senha|\bcpf\b|\bcnpj\b|open finance|proposta/i
```

Crítico **sem** `args.autorizar_critico === true` → devolve `{ estado: 'critico', ... }` com **zero
agentes rodados**: nada é construído antes da autorização. A sessão pergunta ao usuário e chama de
novo com `autorizar_critico: true` (os mesmos `args` mais esse campo).

Crítico **com** autorização → constrói, e o Jev roda com `--critico`. O `juiz.mjs` então nunca dá
`passou` (linha 229: `passou` com crítico vira `humano`). O laço trata esse caso como
**`revisao_humana`** (seção 5.3): construído, o Jev aprovaria, falta o olho humano.

### 4.4 A ponte do Jev, dentro do monitoring

Quem roda o juiz é o **monitoring** (a skill dele inclui o juiz do `decision-gate`), não um nó a mais.
O prompt manda, nesta ordem, só lendo e sem mexer no índice do git:

1. gravar o ticket (e a spec da tarefa, quando houver) em `$TMPDIR/<padrao>-<id>-spec.md`;
2. gravar o diff **só dos arquivos do ticket**, com os novos:
   `{ git diff HEAD -- <arquivos>; for f in <arquivos não rastreados>; do git diff --no-index /dev/null "$f"; done; }`
   — nunca `git diff HEAD` inteiro, que levaria trabalho alheio do working tree;
3. rodar a verificação **do ticket** (os testes dos arquivos dele, não a suíte inteira: outros
   implements da mesma onda podem estar escrevendo) e gravar a saída;
4. rodar `node ~/.agents/skills/decision-gate/scripts/juiz.mjs --gate --spec-arquivo … --diff-arquivo …
   --verificar-saida …` (mais `--critico` quando o ticket é crítico);
5. devolver o **exit code** e o JSON do stdout **sem interpretar** (`veredito`, `confianca`, `critico`,
   `probabilidades`), mais a linha do stderr.

O veredito sai do exit code, em código: `0 passou · 2 refaz · 3 humano · 1 erro`. Qualquer outro
valor, ou exit ausente, é `1`. **`1` é "não julgado", nunca `passou`.**

## 5. `laco-de-refaz`

implement ⇄ monitoring sobre **um** ticket, até 2 voltas de refaz; na 3ª, humano.

### 5.1 Entrada (`args`)

```js
{
  ticket: TICKET,              // obrigatório (4.1)
  spec: '...' | { ... },       // opcional: a spec da tarefa inteira, como contexto do implement e do Jev
  critico: false,              // opcional: o reach já marcou
  autorizar_critico: false,    // opcional: o usuário autorizou
}
```

### 5.2 O grafo

```
validar → trava crítica → [ implement → (lacuna? fim) → fora do ticket? → monitoring+Jev → decidir ] × até 3
```

- **Volta 0** é a primeira construção. `refaz` na volta 0 → volta 1; na volta 1 → volta 2; **na volta
  2 → `humano`**. No máximo 3 implements e 3 monitorings por ticket. O teto é constante no código
  (`MAX_VOLTAS = 2`), não `args`.
- **implement** (`agentType: 'implement'`): recebe o ticket, a spec da tarefa, os arquivos
  exclusivos ("outros implements rodam em paralelo nos outros arquivos — não toque neles"), e, a
  partir da volta 1, o `faltou` da volta anterior. Contrato de volta (o `IMPLEMENT` da `orchestri`,
  mais `construtor`):
  `{ arquivos, verificacao: { comando, passou, saida }, lacuna?, decisoes?, construtor? }`.
  `construtor` é o `harness:modelo` que construiu (o implement declara, pela spec de harness por
  agente); vai para o monitoring como `--construtor`.
- **lacuna** → fim com `estado: 'lacuna'`, sem monitoring. Lacuna é do reach.
- **Fora do ticket, em código**: `arquivos` do implement que não estão em `ticket.arquivos` (com
  prefixo de pasta valendo, 6.3) → conta como `refaz` com `faltou: ['tocou fora do ticket: <x> —
  reverta a sua mudança nele, ou devolva lacuna']`, **sem** gastar o monitoring (P3).
- **monitoring** (`agentType: 'monitoring'`): lê o diff (não o relato), roda a verificação do
  ticket, roda a skill `code-review` nos dois eixos sobre o diff do ticket, julga cada critério de
  pronto com evidência e roda o Jev (4.4). Contrato:
  `{ jev: { exit, veredito?, confianca?, critico?, probabilidades?, linha? }, code_review: { bloqueia, standards?, spec? }, criterios: [{ criterio, atende, evidencia? }], faltou: [...] }`.
  O monitoring **não** dá veredito próprio: dá a evidência; o veredito é a função `decidir`.

### 5.3 `decidir` — função pura

```
exit 1, ausente ou desconhecido          → humano    (motivo: "o Jev não julgou — o trabalho NÃO foi julgado")
exit 3 e jev.critico e a maior
  probabilidade é "passou"               → revisao_humana   (crítico autorizado: o Jev aprovaria)
exit 3                                   → humano
exit 2                                   → refaz
exit 0 e (code_review.bloqueia ou
  algum criterio.atende === false)       → refaz    (o bloqueio vence: regra da orchestri, linha 450)
exit 0                                   → passou
```

`refaz` leva `faltou` = o `faltou` do monitoring + os achados que bloqueiam + os critérios que não
atendem. Vazio (o Jev não lista faltas), leva a linha do Jev e "releia a spec e a verificação".

### 5.4 Retorno

```js
{
  padrao: 'laco-de-refaz',
  ticket: 'T1',
  estado: 'passou' | 'revisao_humana' | 'refaz_esgotado' | 'humano' | 'lacuna' | 'critico' | 'invalido',
  voltas: 1,                         // quantos refaz aconteceram
  arquivos: [...],                   // o que o último implement entregou
  verificacao: { comando, passou, saida },
  construtor: 'cursor:grok-4.7-high',
  jev: { exit, confianca, linha },   // o último
  faltou: [...],                     // em refaz_esgotado e humano
  lacuna: '...',                     // em lacuna
  motivo: '...',
  decidido_sozinho: [...],           // as decisoes do implement, para a sessão mostrar
  historico: [{ volta, construtor, exit, faltou }],
  proximo_passo: '...',              // uma frase, por estado (5.5)
}
```

`refaz_esgotado` é o "na 3ª, humano": é humano, mas a sessão sabe que foi o teto e não ambiguidade.

### 5.5 `proximo_passo`, por estado (texto fixo no código)

| Estado | Próximo passo |
|---|---|
| `passou` | revise o diff dos arquivos; commit e PR são da sessão, sob o gate humano |
| `revisao_humana` | fluxo crítico: o Jev aprovaria, e o humano confere o diff antes de seguir |
| `refaz_esgotado` · `humano` | leve `motivo` e `faltou` ao usuário |
| `lacuna` | leve a lacuna ao reach; com a spec corrigida, rode de novo |
| `critico` | pergunte ao usuário; autorizado, rode de novo com `autorizar_critico: true` |
| `invalido` | corrija os `args` (motivos) |

## 6. `ondas`

Tickets → um `laco-de-refaz` por ticket, em ondas pela dependência.

### 6.1 Entrada (`args`)

```js
{
  tickets: [TICKET, ...],      // obrigatório, não vazio
  spec: '...' | { objetivo, criterio_pronto, ... },  // obrigatório: a spec da tarefa inteira (vai ao fechamento)
  critico: false,
  autorizar_critico: false,
}
```

### 6.2 Validação (`invalido`, zero agentes)

ids repetidos · ticket sem `arquivos` ou sem `criterio_pronto` · `depende_de` que aponta para id
que não está na lista (P4) · ciclo de dependência.

### 6.3 `montarOndas` — função pura, herdada da `orchestri` (linhas 394–413)

- Onda N = os tickets ainda não feitos cujas dependências já estão feitas, **na ordem da entrada**.
- Dentro da onda, um ticket que **disputa arquivo** com um que já entrou nela vai para a onda seguinte
  (e os que dependem dele esperam junto, porque ele não está feito).
- **Disputa** = mesmo caminho, depois de normalizar (`./a` = `a`, sem barra final), ou um ser pasta
  prefixo do outro (`src/x/` disputa com `src/x/a.ts`). A `orchestri` só comparava caminho igual.
- Sem ticket pronto e com resto → ciclo → `invalido` (a `orchestri` lançava; o `executar-mapa` jogava
  tudo na última onda, o que é pior).

### 6.4 O grafo

```
validar → trava crítica (todos os tickets) → montarOndas → por onda: parallel(workflow('laco-de-refaz')) → fechamento
```

- **Trava crítica antes de tudo**: algum ticket crítico (4.3) sem autorização → `estado: 'critico'`
  com a lista dos críticos e **zero agentes, zero workflows**. Não constrói a parte não crítica:
  autoriza-se o conjunto, ou nada.
- **Cada onda**: `parallel(onda.map(t => () => workflow('laco-de-refaz', { ticket: t, spec, critico,
  autorizar_critico })))`. A barreira entre ondas é legítima: a onda seguinte depende do código da
  anterior. Todos trabalham **na mesma árvore**, sem worktree: a exclusividade de arquivo é o que
  separa os implements, e a onda 2 precisa ver o código não commitado da onda 1 (P2).
- `workflow()` que lança (filho com erro) ou volta `null` → aquele ticket vira `humano` com o motivo.
- **Depois de cada onda**: `passou` e `revisao_humana` contam como feitos. Qualquer `lacuna`,
  `humano`, `refaz_esgotado` → a onda termina (os irmãos já estão rodando) e **nenhuma onda seguinte
  começa**; os não iniciados vão em `pendentes`.
- **Fechamento** (só quando todos os tickets estão feitos): **um** monitoring sobre o todo — a
  verificação **inteira** do projeto (`npm run verificar` se existir; senão o teste do projeto), que
  nenhum ticket rodou, e o Jev `--gate` com a spec da tarefa e o diff da **união** dos arquivos
  entregues (4.4, passo 2, sobre a união). O veredito sai pela mesma `decidir`. **`refaz` aqui não
  volta sozinho**: não há um ticket a quem devolver; vira `estado: 'refaz'` e a sessão leva ao reach.

### 6.5 Retorno

```js
{
  padrao: 'ondas',
  estado: 'passou' | 'revisao_humana' | 'refaz' | 'humano' | 'lacuna' | 'critico' | 'invalido',
  ondas: [['T1'], ['T2', 'T3']],
  tickets: { T1: <retorno do laço>, ... },   // só os que rodaram
  entregues: ['T1', 'T2'],
  pendentes: ['T4'],                         // não iniciados
  arquivos: [...],                           // a união do que foi entregue
  fechamento: { jev, verificacao, faltou },  // quando rodou
  criticos: ['T3'],                          // em critico e revisao_humana
  lacunas: ['T2: ...'],
  decidido_sozinho: [...],                   // de todos os tickets, prefixado pelo id
  motivo: '...',
  proximo_passo: '...',
}
```

`estado` agregado, por precedência: `invalido` > `critico` > `humano` (inclui `refaz_esgotado` de
algum ticket) > `lacuna` > `refaz` (fechamento) > `revisao_humana` (algum ticket crítico, ou o
fechamento deu humano crítico) > `passou`.

## 7. `adversarial`

N monitorings tentam **refutar** a mesma afirmação, cada um com uma lente; a maioria decide.

### 7.1 Entrada (`args`)

```js
{
  afirmacao: 'o diff de src/taxa.ts calcula o IOF certo para prazo > 365 dias',  // obrigatório: o que se tenta derrubar
  contexto: '...',            // opcional: o achado, a spec, o relato do implement
  arquivos: ['src/taxa.ts'],  // opcional: onde olhar; o diff é deles contra HEAD
  base: 'main',               // opcional: diff contra esta ref em vez de HEAD
  lentes: ['correcao', 'seguranca', 'reproduz'],  // opcional; este é o padrão
}
```

### 7.2 As lentes, texto fixo no código

| Lente | O monitoring tenta refutar mostrando… |
|---|---|
| `correcao` | um caso (entrada, borda, estado) em que a afirmação é falsa, lendo o código |
| `seguranca` | um jeito de a mudança vazar dado, furar auth, aceitar entrada hostil ou gravar PII |
| `reproduz` | que a afirmação não se sustenta rodando: um teste, um comando, um script local que mostra o contrário. **Nunca contra produção** |
| `spec` | que a mudança não faz o que a spec pede, ou faz além (lente opcional) |
| `desempenho` | um caminho em que a mudança degrada tempo ou memória de forma mensurável (lente opcional) |

Lente desconhecida → `invalido`. Menos de 3 lentes → `invalido`. Lente repetida → `invalido`.

### 7.3 O grafo

```
validar → parallel(lentes.map(l => agent(monitoring, lente l))) → contar
```

- Todos em paralelo, cegos uns para os outros (nenhum vê o voto do outro). `agentType: 'monitoring'`;
  só leitura, e quem roda teste roda local.
- Contrato do voto: `{ lente, refutada: boolean, evidencia: string, endereco: string }`, com
  `evidencia` e `endereco` obrigatórios. O prompt manda: **na dúvida, `refutada: true`** — quem
  sustenta a afirmação precisa da evidência que a sustenta.
- **`contar` — função pura**: votos válidos = não `null`. `refutam > N/2` → `refutada`;
  `sustentam > N/2` → `sustentada`; senão (empate, ou votos perdidos impedem maioria) → `humano`.
  N é o número de lentes pedidas, não o de votos que voltaram: voto perdido não vira maioria.

### 7.4 Retorno

```js
{
  padrao: 'adversarial',
  afirmacao: '...',
  veredito: 'sustentada' | 'refutada' | 'humano' | 'invalido',
  placar: { refutam: 2, sustentam: 1, sem_voto: 0, n: 3 },
  votos: [{ lente, refutada, evidencia, endereco }],
  motivos: [...],     // em invalido
  proximo_passo: '...',
}
```

`refutada` sobre um achado → o achado cai. `refutada` sobre "o diff está certo" → a sessão leva as
evidências ao implement (refaz) ou ao reach (desalinhado), conforme o caso; o workflow não decide qual.

## 8. Como o resultado volta à sessão

- Cada workflow termina em `return <objeto>` (seções 5.4, 6.5, 7.4): é o resultado do `Workflow`
  na sessão. Sem agente de síntese no fim — ele só poria uma camada entre a sessão e o veredito
  (mesma escolha do `executar-mapa`).
- `log()` narra o caminho, uma linha por evento que muda o rumo: plano das ondas, cada refaz com o
  motivo, cada voto, o que ficou pendente. **Nada é cortado em silêncio**: ticket pulado, voto
  perdido e onda não iniciada aparecem no `log` e no retorno.
- A sessão relaya ao usuário `estado` + `motivo` + `proximo_passo`, e mostra `decidido_sozinho`.
- `phase()` com os mesmos títulos do `meta.phases`: `laco-de-refaz` → `Implement`, `Monitoring`;
  `ondas` → `Ondas`, `Fechamento` (os agentes do filho aparecem sob "▸ laco-de-refaz");
  `adversarial` → `Refutar`.
- **Retomada**: mesmos `args`, mesmo resultado do cache. Depois de `critico`, a chamada com
  `autorizar_critico: true` muda os `args` — e nada tinha rodado, então não há o que reaproveitar.
- **Sem `Date.now()`, `Math.random()`, `new Date()`** em lugar nenhum (quebram a retomada); rótulos
  variam pelo id do ticket, pela volta e pela lente.

## 9. Testes — o critério verificável de pronto

**O seam é um só: o script inteiro, executado com os hooks falsos.** Workflow não tem `import` nem
sistema de arquivos, então as funções puras não se exportam; em vez de extraí-las por marcador (o que
a `orchestri` fazia com o `<plano>` e o `sincronizar.mjs`, e que este redesenho larga), o teste roda o
`.js` real.

`simular.mjs` (helper de teste, sem dependência):

- lê o `.js`, troca `export const meta` por `const meta`, e monta
  `new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'workflow', 'budget', corpo)`;
- `agent(prompt, opts)` falso: responde por um roteiro (`opts.label` → resposta, ou função), **grava
  cada chamada** (`prompt`, `opts`) e lança se `opts` tiver `model` ou `effort`, ou se `agentType`
  não for um dos quatro papéis;
- `parallel` e `pipeline` com a semântica do runtime (thunk que lança vira `null`; `parallel` é
  barreira);
- `workflow(nome, args)` falso: roda o **outro `.js` real** pelo mesmo simulador, com os hooks do
  filho em que `workflow()` **lança** — o limite de um nível vira teste;
- devolve `{ retorno, chamadas, logs, fases }`.

**Pronto quando, nesta ordem:**

1. `node --test ~/Sources/agents/claude/workflows/` passa, com:
   - **Estático, nos três arquivos**: o `meta` avaliado num escopo vazio (`new Function('return ' +
     texto)`) dá um objeto — literal puro —, com `name` igual ao nome do arquivo, `description`,
     `whenToUse` e `phases`; todo `phase('X')` do corpo está em `meta.phases`; nenhum
     `Date.now`/`Math.random`/`new Date(`/`import`/`require`/`process.`; `laco-de-refaz.js` e
     `adversarial.js` não contêm `workflow(`.
   - **`laco-de-refaz`**:
     - Jev 0 na volta 0 → `passou`, `voltas: 0`, exatamente 2 agentes (implement, monitoring);
     - Jev 2 e depois 0 → `passou`, `voltas: 1`; o prompt do 2º implement contém cada item do
       `faltou` do 1º monitoring;
     - Jev 2, 2, 2 → `refaz_esgotado` depois de **3** implements e **3** monitorings, nunca um 4º;
     - Jev 3 → `humano` na hora; Jev 1, exit ausente e exit 7 → `humano` com "não julgado", nunca `passou`;
     - Jev 0 com `code_review.bloqueia` → `refaz`; Jev 0 com um critério `atende: false` → `refaz`;
     - Jev 3 com `critico: true` e `probabilidades.passou` maior → `revisao_humana`;
     - `lacuna` → `estado: 'lacuna'`, sem chamada de monitoring;
     - implement que devolve arquivo fora de `ticket.arquivos` → refaz sem monitoring, com
       "tocou fora do ticket" no `faltou`; pasta do ticket cobre arquivo dentro dela;
     - implement `null` → `humano`;
     - ticket "ajusta o cálculo de juros da parcela" com `critico: false` e sem autorização →
       `critico` com **zero** chamadas; ticket que só cita "menos-juros" → não é crítico;
     - crítico autorizado → roda, e o prompt do monitoring contém `--critico`;
     - `ticket` sem `id`, sem `arquivos` ou sem `criterio_pronto` → `invalido` com zero chamadas.
   - **`ondas`** (o laço real, simulado, como filho):
     - A; B depende de A; C disputa arquivo com A → `[['A'], ['B', 'C']]`; a ordem da entrada se mantém;
     - `src/x/` e `src/x/a.ts` disputam; `./a.ts` e `a.ts` disputam;
     - ciclo, dependência desconhecida, id repetido, ticket sem arquivos → `invalido`, zero chamadas;
     - um ticket crítico entre três, sem autorização → `critico` com a lista, **zero** agentes e
       **zero** `workflow()`;
     - B (onda 1) `humano` → a onda 2 não começa; `pendentes` lista os dela; `estado: 'humano'`;
     - `lacuna` num ticket → `estado: 'lacuna'`, `lacunas` com o id;
     - filho que lança → aquele ticket `humano` com o motivo, os irmãos seguem;
     - tudo `passou` → exatamente **um** monitoring de fechamento, com a união dos arquivos no prompt;
       fechamento 0 → `passou`; fechamento 2 → `refaz`, sem nova chamada de laço;
     - `workflow()` é chamado com `'laco-de-refaz'` e `autorizar_critico` repassado;
     - um ticket `revisao_humana` e o resto `passou` → `revisao_humana`, e as ondas seguintes rodam.
   - **`adversarial`**:
     - 3 lentes, 2 refutam → `refutada`; 1 refuta → `sustentada`;
     - 1 refuta, 1 sustenta, 1 `null` → `humano`; 4 lentes 2 × 2 → `humano`;
     - lente desconhecida, repetida, ou 2 lentes → `invalido`, zero chamadas;
     - cada prompt contém o texto da sua lente e a afirmação; nenhum prompt contém o voto de outro;
     - os N agentes são disparados antes de qualquer um resolver (o falso conta os em voo).
2. Depois de `./install.sh`: `~/.claude/workflows/laco-de-refaz.js`, `ondas.js` e `adversarial.js`
   são links para `~/Sources/agents/claude/workflows/`, e o `install.sh` rodado duas vezes não muda nada.
3. **Fumaça real, uma vez, num repositório descartável** (gasta agentes; é o único passo que gasta):
   numa pasta `git init` com um `package.json` de teste, `Workflow({ name: 'ondas', args })` com dois
   tickets triviais (um depende do outro) termina `passou`, os agentes aparecem sob "▸ laco-de-refaz",
   e o `log` mostra as duas ondas. Confirma também os três fatos do runtime da seção 10.

## 10. Fatos do runtime que o implement confirma antes de fixar

O desenho depende de três comportamentos do `Workflow`. Um scout procurou (changelog local, os três
workflows do MenosJuros) e só o primeiro tem fonte, em parte; os outros vêm da doc de autoria
(`workflow()`: "Nesting is one level only: workflow() inside a child throws. Throws on unknown name …;
catch to handle gracefully"), e nenhum workflow existente chama `workflow()`:

1. O registro por nome lê `~/.claude/workflows/` — **confirmado** pelo changelog — e segue symlink
   — **não confirmado**.
2. `workflow()` pode rodar **vários filhos ao mesmo tempo** dentro de `parallel()` — **não
   confirmado**; a doc só diz que o filho divide o teto de concorrência do pai, o que sugere que sim.
3. O `return` do filho chega ao pai, e o `throw` do filho é capturável — a doc diz "return whatever
   it returns" e "catch to handle gracefully"; **não visto rodando**.

O primeiro passo do implement é um workflow descartável de 10 linhas (pai com `parallel` de dois
`workflow({ scriptPath })` filhos sem agente, um que retorna e um que lança, e um filho que chama
`workflow()`) — custa zero agentes — e o link de `~/.claude/workflows/` testado por nome.

Se (1) falhar: o `install.sh` liga os três dentro de `<projeto>/.claude/workflows/` de cada projeto
que os usa (o MenosJuros primeiro), e a seção 3 muda. Se (2) falhar: a onda chama os filhos em
sequência (`for … await workflow()`), e a paralelia dentro da onda se perde — o `log` diz isso. Se (3)
falhar no `throw`: o laço nunca lança; todo erro vira `estado`.

## 11. O que muda em cada arquivo

Repositório `~/Sources/agents`. ⚠️ Há mudança do Flávio sem commit e outro agente editando: o
implement toca só os trechos abaixo e não commita nada alheio.

| Arquivo | Mudança |
|---|---|
| `claude/workflows/laco-de-refaz.js` (novo) | Seção 5. Contratos `TICKET`, `IMPLEMENT`, `MONITORING` e o `ondas()`/`ticket()`/`julgar()` da `orchestri` como ponto de partida, sem a ponte de harness (`rodar()`), sem `plano`, sem `reserva`, sem `model`. |
| `claude/workflows/ondas.js` (novo) | Seção 6. |
| `claude/workflows/adversarial.js` (novo) | Seção 7. |
| `claude/workflows/simular.mjs` · `padroes.test.mjs` (novos) | Seção 9. |
| `install.sh` | Um laço sobre `claude/workflows/*.js` → `~/.claude/workflows/`, igual ao dos agentes. |
| `agent.md` | No catálogo dos 8 padrões: as entradas `laço de refaz`, `ondas` e `adversarial` dizem o nome do workflow e uma linha dos `args`; a do ciclo inteiro diz "leque → reach → `ondas`". O resto do catálogo não é desta spec. |
| `README.md` | Uma linha em "Instalar" sobre `~/.claude/workflows/`. |

## 12. Fora de escopo

- Os outros cinco padrões (leque, até secar, névoa, diagnóstico, painel) em código: ficam texto.
- Um workflow do ciclo inteiro: é composição da sessão (seção 2).
- Escolher harness ou modelo, ponte para CLI externa, `reserva` quando o Grok falha: é do agente
  (`specs/harness-por-agente.md`).
- Porta do Jev (grande/pequena), painéis do Herdr, grilling, `to-map`, `to-spec`, `to-tickets`
  dentro do grafo: morrem com a `orchestri`; a sessão chama o reach.
- O gauntlet do `npm run adversarial` (o crítico cego que ataca a tela do CRM): é outra coisa, do
  MenosJuros; o `adversarial` daqui refuta uma afirmação.
- Commit, PR, merge, mover card (P1).
- Worktree por ticket (P2).
- `adversarial` dentro do laço ou das ondas: o limite de um nível não deixa.
- Publicar tickets no tracker: os tickets chegam pelos `args`.
- Mudar `juiz.mjs` ou os limiares dele.

## 13. Perguntas abertas

**P1. Quem abre o PR quando `ondas` volta `passou`?**
A `orchestri` abria (o nó `pr`, só com o Jev `passou`, `git add` arquivo por arquivo). Recomendação:
**a sessão**, não o workflow. O retorno traz `arquivos` (a união entregue) e o `jev` do fechamento;
a sessão commita só esses arquivos e abre o PR quando o usuário pedir. O workflow fica sem escrita
fora dos tickets, e o gate do PR continua visível.

**P2. Mesma árvore ou worktree por ticket?**
O `executar-mapa` usa worktree; a `orchestri` usava a mesma árvore com arquivos exclusivos.
Recomendação: **mesma árvore**. Com worktree, a onda 2 nasce do `HEAD` e não vê o código não
commitado da onda 1, e o diff final fica espalhado em N árvores. O custo é que um implement pode
pisar no arquivo do irmão — e é para isso que existe a checagem "fora do ticket" em código (5.2).

**P3. Implement que toca arquivo fora do ticket: `refaz` ou `humano`?**
Recomendação: **`refaz`**, sem gastar o monitoring, com o arquivo nomeado no `faltou`. O caso comum
é o teste que o implement criou e o `to-tickets` não listou; a volta resolve (ele reverte, ou devolve
lacuna para o reach incluir o arquivo). Se acontecer na volta 2, o teto manda ao humano como sempre.

**P4. `depende_de` que aponta para id fora da lista: erro ou ignora?**
A `orchestri` e o `executar-mapa` ignoravam (dependência "já pronta"). Recomendação: **`invalido`**.
Os tickets vêm da mesma `to-tickets` da mesma spec; id desconhecido é erro de digitação, e ignorar
roda fora de ordem em silêncio. Quem quer rodar um subconjunto tira a dependência ao montar os `args`.

**P5. Ticket crítico autorizado: as ondas seguintes rodam sobre ele?**
Com `--critico` o Jev nunca dá `passou`, então todo ticket crítico termina, no melhor caso, em
`revisao_humana`. Recomendação: **contar como feito e seguir**: a autorização foi dada para o
conjunto antes de construir, o merge é humano de qualquer forma, e parar na primeira onda crítica
faria o usuário reautorizar onda por onda. O retorno lista os críticos, e o `estado` final nunca é
`passou` quando algum foi crítico.

**P6. A trava crítica das ondas é por conjunto ou por ticket?**
Recomendação: **por conjunto** — um crítico sem autorização para tudo, zero agentes. Construir só os
não críticos deixaria um meio-trabalho cuja ordem depende de quem ainda não foi autorizado.

**P7. Quem roda o Jev: o monitoring, ou um nó-ponte barato separado?**
A `orchestri` usava um nó Haiku "não interprete" para o Jev. Recomendação: **o monitoring**, que já
tem o juiz entre as skills dele e já lê o diff e roda a verificação. Um nó a mais teria de escolher
modelo (`model: 'haiku'`), o que estes workflows não fazem. O risco — o monitoring relatar um exit
errado — fica coberto pela regra de que exit ausente ou estranho é "não julgado".

**P8. As lentes do `adversarial` pedem modelos diferentes?**
A diversidade vem da lente, não do modelo; e o workflow não escolhe modelo. Recomendação: **não**.
Os N votos saem do mesmo monitoring resolvido pela tabela. Se a bancada mostrar votos correlacionados
demais, a mudança é na `papeis/` (um `--excluir` por lente), não aqui.

**P9. O nome `adversarial` confunde com o `npm run adversarial` do MenosJuros?**
Recomendação: **manter `adversarial`**, que é o nome do padrão no catálogo; o `whenToUse` diz em uma
frase que não é o gauntlet de tela. Os dois vivem em namespaces diferentes (workflow × script npm).

**P10. O fechamento das ondas é obrigatório?**
Ele gasta um monitoring a mais e roda a suíte inteira. Recomendação: **sim, sempre**. Cada ticket
rodou só os testes dele, com irmãos escrevendo ao lado; a suíte inteira e o diff da união são a única
prova de que as fatias somadas não quebraram nada, e o que mede a deriva da soma, que hoje ninguém
mede.

## Decididas em 03/10/2026

O usuário delegou a decisão ("as decisões pode decidir"). Valem as recomendações de P1 a P10:
P1 a sessão abre o PR, nunca o workflow · P2 mesma árvore, sem worktree · P3 arquivo fora do ticket é `refaz` ·
P4 `depende_de` para id inexistente é `invalido` · P5 crítico autorizado segue em `revisao_humana`, e o estado final
nunca é `passou` · P6 a trava crítica vale para o conjunto · P7 o Jev roda dentro do monitoring · P8 as lentes não
pedem modelos diferentes · P9 o nome `adversarial` fica, com a diferença explicada no `whenToUse` · P10 o fechamento
das ondas é obrigatório.
