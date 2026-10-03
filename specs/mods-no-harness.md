# Spec (mapa de decisão): onde os Claude Mods entram no harness

> Status: rascunho do reach, 03/10/2026. **Não construir antes das perguntas abertas (§8).** Pedido do
> Flávio: *"independente, veja onde mais pode se encaixar na nossa harness"*. O ponto de partida foi *"o
> dev está no Claude Code, move o card do Multica e já fala no canal do Buzz"*. Esta spec é o mapa:
> diz o que vale agora, o que fica para depois e o que não entra. As fatias saem dela pela `to-tickets`.

## 1. O que um mod é (conferido na fonte)

Fontes primárias: `code.claude.com/docs/en/plugins/mods/{overview,reference,api}.md`, e
`code.claude.com/docs/en/plugins/install`. Também os tipos que o próprio Claude Code 2.1.287 escreve
(`plugin-authoring/types/claude-code.d.ts`, 20 mil linhas) e o `reference.md` da skill `plugin-authoring`.
A máquina tem o **2.1.288** instalado. Mods exigem **≥ 2.1.287** e vêm ligados por padrão.

- **Forma.** Um mod é um plugin: `.claude-plugin/plugin.json`, mais `hooks/hooks.json` com
  `{"modules": ["./register.ts"]}`, mais o módulo, que exporta `register(on, options)`. O nome do
  arquivo não é fixo em `register.js`: vale `.js`, `.ts`, `.tsx` e o resto. Cada hook recebe
  `($, e, next)` e pode observar (`next(e)`), reescrever (`next({...e})`) ou responder sozinho
  (`{deny}`, `{result}`). O módulo roda num ambiente **sem Node e sem DOM**. Tudo que sai dele passa
  pelo `$`, e por isso `claude plugin validate` consegue listar o que o mod chama antes de rodar.
- **Eventos que importam aqui.** `tool.call` (antes do tool; com `await next(e)` também se vê o
  resultado), `tool.check` (a decisão de permissão), `prompt.submit`, `prompt.context`,
  `prompt.compose`/`prompt.section`, `skill.prompt`, `attribution.text`, `turn.start`/`turn.step`/
  `turn.complete`, `session.start`/`session.end`/`session.measure`/`session.append`/`session.receive`,
  `agent.offer`/`agent.spawn`, `command.run`, `ui.render`, e `classic.<Evento>`, que deixa um mod
  interceptar os settings hooks atuais.
- **Subagentes e workflows passam pelo mod.** Todo evento traz `agentId`, que identifica o loop: o de
  um subagente, o de um agente de workflow ou o de uma fork do próprio engine (`claude-code.d.ts`,
  `AgentLoop`). Um `tool.call` dentro do `laco-de-refaz` chega ao mod da sessão.
- **API.** `$.ui` (pane, banda `AbovePrompt`, `status`, `toast`, `log`, `notice`, e restyle de
  `Spinner`, `ToolUse` e `UserMessage`), `$.command.register` (comando sem turno; com
  `immediate: true` roda mesmo com o Claude trabalhando), `$.model.complete|fork|classify` (gastam o
  **plano ou a chave do dev**), `$.session.messages|usage|send|append`, `$.process.run` (sem shell;
  30 s por padrão, 10 min no máximo), `$.http.fetch`, `$.mcp.call`, `$.store` (4 MiB de JSON, um só
  por máquina e compartilhado entre sessões), `$.state` (reativo, da sessão) e `$.clock.every|after`.
  O formato de envio é `$.session.send({ to, text })`, e não `(msg, id)`.
- **Limites.** Cada hook tem 10 s do **próprio** tempo; o que se espera em `next` ou numa chamada do
  `$` não conta, menos o `$.clock.sleep`. Um `.catch` tem 1 s, e todos os `session.end` somados têm
  1,5 s. O hook que falha é pulado e a cadeia segue.
- **Onde roda** (tabela "Where mods run" do overview):

  | Onde | Hooks | UI |
  |---|---|---|
  | `claude` no terminal, aba Code do Desktop | sim | sim |
  | chat do VS Code | sim | **não** |
  | `claude -p` e Agent SDK | sim, se o plugin estiver instalado na máquina | **não** |
  | sessão cloud (claude.ai/code) | só os plugins do managed settings: **não carrega o que o `.claude/settings.json` do repo liga** | **não** |
  | Codex, Cursor, OpenCode, Antigravity | **nunca** | — |

- **Segurança.** O mod **não tem sandbox**: roda com as permissões do dev, lê env e segredos, e
  **pode aprovar uma chamada que um `PreToolUse` nosso bloqueou** (`tool.check` → `allow`). Não
  consegue mexer no permission prompt. Em plano Team ou Enterprise, o guarda `sec-default@builtin`
  carrega antes dos mods do usuário, e o admin pode ligar `allowManagedModsOnly`.
- **Como o time recebe.** É possível versionar no projeto. Na instalação com **escopo de projeto**,
  a entrada vai para `enabledPlugins` do `.claude/settings.json` commitado, mas o commit **não baixa
  o plugin**: cada dev roda `claude plugin install <mod>@<marketplace> --scope project` uma vez. O
  marketplace pode ser um diretório local, dentro do repo. O `reference.md` da `plugin-authoring` cita
  ainda um plugin "auto-loaded from a skills folder (… the project's `.claude/skills/<name>`)". Isso
  não aparece nas páginas públicas e entra no T0 (§6).
- **"You should know"** (`cc-plugin-you-should-know@builtin`) é um mod embutido, **desligado por
  padrão**, "if available for your org". Liga com `/plugin enable`. A doc **não diz** quais lacunas ele
  vigia nem deixa configurar isso. A exigência de "sessão first-party com telemetria", que veio no
  briefing, **não foi confirmada** na doc pública.
- **A API é early access** ("may change between releases without notice"). Os tipos são a autoridade
  de cada build.

## 2. O harness hoje: o que um mod tocaria

Conferido pelo scout e na leitura direta:

- **Os settings hooks, em `.claude/settings.json:22-175`, são todos command-based.** São 13 entradas
  em 6 eventos: `pii-guard` (PreToolUse `Linear|Bash`, 5 s), `pre-commit-docs` (PreToolUse `Bash`,
  30 s), `regras-por-caminho` (PreToolUse Edit/Write/Read, 5 s), `memoria` (captura em toda
  PostToolUse, turno no Stop e sessão no SessionEnd; chama o Jev e o Haiku), `contexto-core` e
  `memoria-cli contexto` (SessionStart), e os `graft-hooks` (de terceiro). **Não há
  `enabledPlugins`** nem mod no projeto, e não há hook em `Agent`.
- **O juiz** (`scripts/harness/juiz.mjs`) devolve o veredito no exit code (0 passou · 2 refaz ·
  3 humano · 1 erro) e no JSON da saída. **Nada persiste o veredito.** Ele vive na saída do Bash de
  quem chamou.
- **Os workflows não reportam progresso.** O `agent-loop-rodadas.js` guarda o histórico em memória e
  o devolve em JSON no fim (`:260-271`). Não há arquivo de estado.
- **O headless já é real**, e é onde o mod não chega inteiro:
  - `despachar.mjs:95,1192`: `railway code --claude -- -p` numa VM do molde.
  - `bancada.mjs:8`: `claude -p --output-format json` **neste repo**. Um mod do projeto rodaria
    dentro da bancada e mudaria o que ela mede.
  - Os runners Cursor e OpenCode, onde o mod nunca roda.
- **A spec do canal** (`specs/multica-e-buzz.md`) decidiu que **"quem avisa é quem age"**: a sessão
  do dev roda o `canal.mjs` como o Status, no mesmo passo em que muda o card (§4, `:208`; §5). O
  Multica não tem webhook de saída. Hoje não existe hook nenhum que poste no canal. O hook
  PostToolUse foi só proposto.
- **A spec do harness autossuficiente** (`.claude/specs/harness-autossuficiente.md`) leva o mecanismo
  inteiro para dentro do projeto, para vários devs, com manifesto explícito de sincronização. Mod
  novo tem de caber nisso: mora no projeto e vale para todos.

## 3. O critério que decide cada encaixe

Uma regra só, e ela sai do §1:

> **A regra que precisa valer em toda execução não mora no mod.** Ela fica onde roda sempre: no
> settings hook commitado, no script que o agente chama ou no código do workflow. **O mod fica com o
> que é da sessão interativa do dev**: o que ele vê (pane, banda, toast), o comando sem turno, o
> estado que atravessa os eventos da sessão e o que observa os subagentes de dentro do processo.

Por quê: o settings hook vem com o `git clone`, já roda em `claude -p` e na VM, e não pede instalação.
O mod pede uma instalação por dev, não vai à sessão cloud, não alcança Codex nem Cursor, e um dev sem
ele **contorna a regra sem perceber**. Trava em mod é trava opcional.

Corolário: **nada no harness pode depender do mod para funcionar.** Sem o mod, o dev perde conforto e
nenhuma regra.

## 4. Os encaixes, um por um

Legenda: **S** = substitui · **A** = acrescenta · veredito **agora / depois / nunca**.

### 4.1 Card → canal: o candidato principal ("o mod na saída, um agente só na entrada")

**O desenho que o Flávio propôs:** *"se o mod for a solução para a conexão Multica→Buzz, talvez não
precisemos de agentes lá, só um"*. Ele tem duas metades:

- **Saída** (sessão do dev → canal): um mod intercepta os comandos `multica` na sessão e posta pelo
  `canal.mjs`. Não fica chave de agente no Keychain de cada dev.
- **Entrada** (pessoa no canal → projeto: "como está?", pedido novo, resposta a uma pergunta): **um
  agente só** no Buzz, que junta a Triagem, o Escriba e o Status. O mod só existe com uma sessão
  aberta, e a entrada precisa de alguém acordado.

**O que o mod faria.** Ele observa o `on('tool.call', {tool:'Bash'})` (ou o
`classic.PostToolUse`) que casa `multica issue (status|comment) …`. Depois de `await next(e)` com
sucesso, ele **não espera a rede**: agenda `$.clock.after(0, () => $.process.run(['node', canal.mjs,
'linha', …]))` e devolve o resultado do tool na hora. Quando o post sai, um `$.ui.toast('postado em
#<canal>')` confirma. O `$.state` guarda o que já foi postado no turno, para não postar duas vezes.

**(a) Os hooks do mod disparam onde o harness despacha?** Fontes: a tabela "Where mods run" do
overview, a página de install e o `AgentLoop` do `claude-code.d.ts`.

| Onde o card se move | Hook do mod | Settings hook PostToolUse do repo |
|---|---|---|
| sessão interativa do dev, com o mod instalado | sim | sim |
| **subagente** e **agente de `Workflow`** na mesma sessão | **sim**: o evento traz `agentId` | sim (a confirmar no T0) |
| `claude -p` na máquina do dev (bancada, scripts) | sim, se o plugin está instalado ali ("Plugins you already installed do load") | sim |
| **VM do Railway** (`railway code --claude -- -p`) | **só se o molde tiver o plugin instalado**: o escopo de projeto não baixa o plugin | **sim**: vem com o clone |
| dev sem o mod instalado | **não** | sim |
| sessão cloud (claude.ai/code) | **não**: não carrega o que o `.claude/settings.json` do repo liga | sim, se a sessão cloud ler os hooks do projeto (a confirmar) |
| Cursor, Codex, OpenCode | **não** | **não** |

Resultado: **a saída pelo mod tem buraco**, e é o buraco do headless (VM e dev sem mod), que é
justamente onde o harness despacha. O complemento natural é o **settings hook PostToolUse** que já
estava proposto, e ele cobre **tudo o que o mod cobre, menos a UI**. Os dois juntos postariam em
dobro. Então o post fica **só no hook shell**, e o mod fica só com o toast. Nenhum dos dois cobre
Cursor e Codex. A única saída que cobre todo runner é **observar o Multica**, e não a sessão (ver a
recomendação).

**(b) Com que identidade o mod posta?** O mod não tem identidade própria: o `$.process.run` roda
como o dev, com o que estiver no Keychain dele (doc: "Act on your machine as you"). Isso deixa três
opções:

1. **A identidade do próprio dev** (a chave pessoal dele no Buzz). Segue a regra do harness, "cada
   dev entra com a credencial DELE". Não há segredo compartilhado nem rodízio de chave quando alguém
   sai. Contra: a mensagem aparece como se o dev a tivesse digitado. Mitigação: o texto leva o
   rodapé fixo `via sessão · <papel>`, e a chave pessoal só serve para `linha` e `tocar`. Hoje o
   `canal.mjs` **recusa** a chave pessoal de qualquer humano (spec do canal, §6 "Identidade"), e
   isso teria de mudar.
2. **Uma identidade de projeto**: um par de chaves Nostr criado fora do Desktop, sem ser agente
   gerenciado, numa entrada de Keychain por dev. É o P1(a) da spec do canal com uma chave em vez de
   três. Continua sendo segredo compartilhado, e quem sai obriga a girar a chave. Por outro lado, não
   depende do T0(d), porque não precisa exportar chave de agente gerenciado.
3. **A sessão não assina nada.** Ela escreve no card, o que já faz. Quem posta é **o agente único**,
   que **observa o Multica** (lista de atividade por polling, já que o Multica não tem webhook de
   saída, §1.1 da spec do canal) e fala como ele mesmo. **Nenhuma chave na máquina do dev.**

**(c) Custo e risco.**
- **Tempo.** O teto de 10 s conta só o código do hook. A espera de um `$.process.run` não conta,
  mas, se o hook esperar o post antes de devolver, o resultado do Bash chega atrasado pelo tempo de
  rede do relay. Por isso o post é **assíncrono**:
  - no mod, por `$.clock.after`, cujo callback roda fora do dispatch, e o erro vai ao debug log;
  - no hook shell, por um processo destacado (`spawn(…, {detached:true}).unref()`) e `exit 0`
    imediato, com o erro gravado num log local.

  Um post perdido não quebra nada, porque a verdade é o card. Postar no `session.end` está fora,
  porque o teto ali é de 1,5 s somados.
- **Tokens.** Zero de modelo. O `canal.mjs` é mecânico.
- **Ruído.** Uma linha por transição, com debounce por card. Os toques com conteúdo (perguntas,
  checks, crítico, humano, merge) carregam o texto que só o agente sabe escrever, e continuam
  explícitos pelo `canal`.
- **PII.** O `canal.mjs` já barra.
- **Sem sandbox.** O mod roda como o dev. Isso não muda o que o `canal.mjs` faz.

**(d) O que muda na `multica-e-buzz.md` e na skill `canal`** (aqui só o apontamento; a edição é de
outro ticket):
- **§3 e "Decididas em 03/10/2026": a proposta reverte uma decisão.** Aquela decisão trocou
  explicitamente *"um Gerente com três funções"* por três agentes pequenos, por menor privilégio e uma
  função cada. O agente único volta à forma rejeitada, e isso tem de ser decidido em voz alta (P9).
  O menor privilégio continua possível **no script**: a tabela comando × papel do §6 não depende de
  haver três agentes.
- **§6, tabela de segurança.** O par deixa de ser *comando × um dos três papéis* e passa a ser
  *comando × quem assina*:
  - **sessão do dev**: `linha`, `tocar` e `abrir` (com `--disparado-pelo-usuario`);
  - **agente**: `triar`, `transcrever`, `ligar-pr`, `ler`, responder ao "como está?" e `arquivar`.

  Com a opção 3 do (b), a sessão sai da tabela, e o agente faz também `linha` e `tocar`.
- **§6 "Identidade".** Com a opção 1, o `canal.mjs` passa a aceitar a chave pessoal do dev só para
  `linha` e `tocar`. Com as opções 2 e 3, a regra atual fica.
- **§6, `canal.json`.** `papeis` passa a ter uma entrada. `humanos` ganha a entrada de Keychain de
  cada dev, se valer a opção 1.
- **§5, os momentos.** A coluna "quem fala" passa a ter duas vozes: na saída, o hook (linhas
  mecânicas) e a sessão (toques com conteúdo); na entrada, o agente único.
- **§8, itens 7 e 8, e T0.** Uma instrução (`buzz/<agente>.md`) em vez de três, e um agente
  gerenciado em vez de três. O **P1** (chave de agente no Keychain de cada dev) e o **T0(d)** deixam
  de existir. O **P3** passa a ser um membro do Multica, e não dois. O T0(f), se o agente roda fora do
  Desktop, ganha peso: com a opção 3, a saída inteira depende dele.
- **A skill `canal`.** O `--papel` obrigatório vira `--como <sessao|agente>`. `abrir`, `linha`,
  `tocar`, `ler` e `arquivar` trocam de dono conforme a tabela acima. A `SKILL.md` ganha o hook
  como o caminho das linhas mecânicas.

**Recomendação.**
- **Entrada com um agente só: sim, com uma condição.** A função de cada um vira comando do
  `canal.mjs`, preso ao agente na tabela, e o menor privilégio fica no script. Como reverte uma
  decisão de 03/10, é o P9.
- **Saída: não pelo mod.**
  - **Agora**, até o agente estar sempre ligado: o **settings hook PostToolUse** (`scripts/hooks/`),
    assíncrono, só nas transições mecânicas, assinando com a **identidade do dev** (opção 1, P10).
    Ele cobre a sessão, os subagentes, os workflows, o `claude -p` e a VM, sem instalar nada.
  - **Depois**, quando o agente único rodar fora do Desktop (T0(f) da spec do canal): a saída passa
    para **o agente observando o Multica** (opção 3). É a única que cobre o Cursor e o Codex, e tira
    toda chave da máquina do dev. O hook sai.
- **O mod fica com o que só ele faz**: o toast de "postado", o `/canal` sem turno e a banda do
  §4.2. Nunca com o post.

### 4.2 O painel do projeto: pane, banda e `/comandos` sem turno

- **O que o mod faria.**
  - **Banda acima do prompt**, compacta: o card atual (chave e status), o domínio, o branch, o padrão
    em execução e o último veredito do Jev.
  - **`/projeto`** abre um pane com o card, o mapa do projeto, os vereditos da sessão e o custo. Como
    é aberto pelo dev, assenta em qualquer largura.
  - **`/card`** mostra o card atual. **`/canal <texto>`** posta pelo `canal.mjs` sem gastar turno
    (`immediate: true`).
  - Os dados saem de três lugares. O card e o domínio vêm do índice `memory/episodic/<branch>.md`,
    que o `contexto-core` já deriva, e do `multica` sob demanda (`$.process.run`). O padrão em
    execução vem da observação do `tool.call` da ferramenta `Workflow` e do seu fim. **O veredito
    vem da observação do Bash que chamou `juiz.mjs --gate`**: o exit code está no resultado de
    `next(e)`, e vale também dentro dos agentes do workflow, por causa do `agentId`.
- **S/A.** Acrescenta. Hoje não há nada disso. Os comandos substituem perguntas que hoje custam um
  turno ("como está o card?").
- **Ganho.** Visibilidade sem tokens: o `{}` do `command.run` abre o pane e não entra no contexto. É
  o primeiro uso de mod de risco baixo, porque só lê, e ele exercita a distribuição que todos os
  outros vão usar.
- **Custo e risco.** Desenha só no terminal e no Desktop. Ler o veredito pelo texto do comando Bash
  é acoplamento frágil, e o remédio é o juiz gravar uma linha por veredito num JSONL do projeto (P8).
  O `multica` leva até 30 s, por isso o pane mostra o cache e atualiza em segundo plano.
- **Veredito.** **Agora**, como o primeiro mod, depois do T0 (§6). Só leitura, sem `$.model`.

### 4.3 A "primeira decisão" (domínio e caminho) na banda, ou checada no turno

- **O que o mod faria.** Há duas formas:
  - (a) **checagem determinística** no `turn.complete`: a primeira linha da resposta declara o
    caminho? O teste é uma regex sobre `vou chamar|caminho:` e os nomes dos padrões. Se não declara,
    sai um `$.ui.notice`. O que foi declarado aparece na banda.
  - (b) **classificador** `$.model.classify(prompt, [scout, reach, laço, monitoring, ciclo,
    agent-loop])` no `prompt.submit`, que injeta a sugestão como `context`.
- **S/A.** (a) acrescenta uma checagem que hoje só existe em prosa no `agent.md:48-72`. (b) duplica o
  `rotear.mjs` do Jev.
- **Ganho.** (a) dá ao dev a decisão diante dos olhos, de graça. (b) é uma segunda opinião em todo
  prompt.
- **Custo e risco.** (b) gasta tokens do plano do dev em todo prompt e concorre com o Jev, o que dá
  dois roteadores. (a) erra em alguns casos e só avisa.
- **Veredito.** (a) entra **depois** do §4.2, na mesma banda. (b) **nunca**: o roteador é o Jev, e
  ponto.

### 4.4 Um side agent no estilo "You should know"

- **O que o mod faria.** No `turn.complete`, um `$.model.fork` sobre a conversa pergunta: deriva da
  spec, fluxo crítico sem gate, card não atualizado, PII.
- **S/A.** Acrescenta.
- **Custo e risco.** A fork reenvia o prefixo inteiro. Mesmo servido do cache, cada turno de uma
  sessão de 200 mil tokens custa cerca de 20 mil tokens equivalentes, por dev e por turno, no plano
  dele. Ele também repete o trabalho que já é do Jev: a deriva de spec é o `--gate`. Três das quatro
  vigias dispensam modelo:
  - **card não atualizado**: houve `Edit`/`Write` no turno e nenhum `multica` (no `$.state`);
  - **crítico sem gate**: um caminho tocado casa a lista crítica e não há `--critico` nem
    autorização registrada;
  - **PII**: já é do `pii-guard` e do script do canal.
- **Veredito.** A **vigia determinística**, com notices na banda do §4.2, entra **depois**. O **side
  agent com modelo** fica em **nunca, por ora**: volta a ser considerado só se os notices
  determinísticos mostrarem lacuna que só um modelo vê. O **"You should know" embutido** é escolha de
  cada dev (`/plugin enable`) e não entra no harness, porque a doc não deixa configurar o que ele
  vigia.

### 4.5 Travas em código para regras que hoje são prosa

Subagente sem papel, `git stash` sem tag, escrita em produção (`railway up`, `gcloud run deploy`, SQL
em prod).

- **O que o mod faria.** `agent.spawn` → `{deny}` para `subagent_type` fora da lista de papéis, ou
  `{model}` para impor o piso T2 em fluxo crítico. `agent.offer` → `{isOffered:false}` esconde
  `general-purpose`, `Explore` e `Plan` do modelo. `tool.call` no `Bash` → `{deny}` para
  `git stash` sem `push -m` e para os comandos de produção.
- **S/A.** Substituiria a prosa do `agent.md:142-144`, do `CLAUDE.md` ("escrita direta em produção,
  sempre proibida") e do aviso de stash do ambiente.
- **Custo e risco.** Pelo §3, essa é exatamente a regra que **não pode** ser opcional. Um **settings
  hook PreToolUse** faz o mesmo `deny` (com matcher `Agent` e matcher `Bash`), roda em `claude -p`
  e na VM e vem com o clone. A única coisa que só o mod faz é **esconder** o tipo de agente
  (`agent.offer`) e **trocar o modelo** (`agent.spawn {model}`).
- **Veredito.**
  - As travas entram **agora**, mas como **settings hook** (`scripts/hooks/travas.mjs`, com teste),
    **não como mod**. É trabalho independente dos mods, e entra aqui só para registrar onde a regra
    mora.
  - O `agent.offer` para esconder tipos vem **depois**. Antes, precisa de uma allowlist medida: a
    sessão usa `claude-code-guide`, o `impeccable-*` e o `scout-bug`, e esconder demais quebra
    skills.
  - O piso de modelo por `agent.spawn` fica em **nunca, por ora**: o modelo vem do `harnesses.mjs`
    por papel, e dois lugares decidindo modelo divergem.

### 4.6 `/comandos` sem turno

- **O que o mod faria.** Os do §4.2 (`/projeto`, `/card`, `/canal`), mais dois: **`/custo`**
  (§4.9) e **`/juiz`**, que mostra os vereditos da sessão a partir do que o painel observou.
- **S/A.** Substitui a skill ou a pergunta que hoje custa um turno, para consultas que não pedem
  raciocínio.
- **Ganho.** Zero tokens e resposta imediata, mesmo com o Claude trabalhando (`immediate: true`).
- **Custo e risco.** O texto que um `command.run` devolve em `{text}` **entra no contexto do
  modelo**: comando que só mostra devolve `{}` e abre pane. Não existe em `claude -p` nem no chat do
  VS Code (ali o comando responde em texto). O `/canal` escreve para fora: passa pelo `canal.mjs`,
  que barra PII e amarra o papel.
- **Veredito.** **Agora**, junto com o §4.2.

### 4.7 Migrar os hooks shell para mod

| Hook | O que o mod daria | Por que não agora |
|---|---|---|
| `contexto-core` → `prompt.context`/`prompt.compose` | seção do system prompt por prompt, sem o spawn de node no início | perderia `claude -p`, a VM e quem não tem o mod. O blob de 9,5 mil tokens de domínios é o mesmo. **Nunca**, enquanto houver headless |
| `pii-guard` | nada | é trava, então fica no settings hook (§3). **Nunca** |
| `memoria captura` (PostToolUse `.*`, um node por tool call) | buffer em `$.state`, sem spawn por chamada | é o único com ganho real de latência. **Depois**, só se uma medida mostrar que o spawn pesa. O caminho é `classic.PostToolUse`, gradual |
| `memoria turno`/`sessao` (Jev e Haiku) | — | o `session.end` tem 1,5 s no total, e o resumo chama modelo. Com `$.model`, o custo passaria ao plano do dev. **Nunca** |
| `regras-por-caminho` | — | anexa regra ao contexto, então tem de valer headless. **Nunca** |

### 4.8 Agent-loop e workflows: progresso na UI

- **O que o mod faria.** Um pane "rodadas" com a rodada n, a hipótese, mantida ou desfeita, os checks
  e o Jev. Os sinais saem do `tool.call` dos agentes do workflow (`agentId`): `git commit`/`git reset`
  no branch `agent-loop/<slug>`, `juiz.mjs`, `agent-loop.mjs rodada`.
- **S/A.** Acrescenta. Hoje o progresso só aparece no fim, em JSON.
- **Custo e risco.** Casar strings de comando acopla o mod aos scripts. O certo é o mesmo contrato do
  §4.2: o `julgar.mjs` (spec autossuficiente, Decisão 2) grava **uma linha JSONL por veredito**, com
  rodada e padrão, e o mod lê esse arquivo. O mesmo arquivo serve ao humano e ao card.
- **Veredito.** **Depois** do §4.2 e do contrato do JSONL (P8).

### 4.9 Candidatos que as capacidades abrem

| Capacidade | Encaixe | Veredito |
|---|---|---|
| `session.measure` + `turn.complete.usage` + `$.session.usage().cost` | **custo por card**: soma por card (do branch) em `$.store`; `/custo` mostra; no `in_review`, uma linha no contrato de monitoramento do card. Responde *"quanto custou esta feature?"*, que hoje **não tem resposta** desde que o Langfuse saiu. Limite: conta só as sessões Claude com o mod, e não conta o Jev/OpenRouter, a VM nem o Cursor. O `$.store` é por máquina, por isso o total só se junta no card | **agora**, no mod do §4.2, depois do T0 medir se o `cost` inclui os subagentes |
| `attribution.text` | rodapé de commit e PR com `Card: MENO-12`, tirado do branch | **depois**. Pequeno, e hoje o rodapé vem da configuração da sessão |
| `session.receive` / `$.session.send` | **não** é ponte para o Buzz: fala com sessões e agentes Claude da máquina. A ponte certa é `$.clock.every` lendo a thread do card (`canal ler`) → `$.ui.toast("Ana respondeu no MENO-12")` | **depois** da fase 2 do canal. **Nunca** `$.prompt.submit` com texto vindo do Buzz (injeção): no máximo o texto fixo "há resposta nova no MENO-12; leia o card" |
| `classic.<Evento>` | migração gradual dos settings hooks | só se o §4.7 mudar |
| `skill.prompt` | acrescentar a fiação da casa a uma skill do upstream sem editá-la (a `to-map` é verbatim) | **nunca**: a spec autossuficiente decidiu que "as skills são nossas" |
| `prompt.section`, `turn.step {model, effort}`, `tool.check`, `config.set`, `telemetry.*` | reescrever o system prompt, trocar o modelo por request, decidir permissão | **nunca**. Mexem no que o harness já decide em outro lugar, e o `tool.check → allow` **anula os nossos PreToolUse** |
| `session.compact {skip}` | — | **nunca** |

## 5. Onde mora

- **No projeto, sob `.claude/`**, que é o único harness: `.claude/mods/<nome>/` para cada mod, e
  `.claude/mods/.claude-plugin/marketplace.json` como marketplace local. No `.claude/settings.json`
  entram `extraKnownMarketplaces` (o diretório) e `enabledPlugins` (escopo de projeto).
- **Por dev:** `claude plugin install <mod>@menosjuros --scope project` uma vez, no `onboarding.md`,
  e o `npm run doctor` aponta quando falta ou quando o Claude Code é anterior ao 2.1.287.
- **Um mod só no começo**, `menosjuros-painel`, com o §4.2, o §4.6 e o custo do §4.9. Os encaixes de
  depois entram nele, e não em mods novos, até haver razão para separar.
- **Não entra no manifesto de sincronização com o global** (spec autossuficiente, Decisão 3). O mod
  lê o Multica e o episódico **deste** projeto. Se outro projeto quiser, ele vira global depois, por
  decisão.
- **A bancada** (`bancada.mjs`) passa a rodar o `claude -p` sem os mods do projeto, para não medir o
  mod junto com a skill. A flag exata sai do T0 (`--safe-mode` desliga também os settings hooks).

## 6. Ordem recomendada

0. **T0, um spike de uma sessão**, pelo `prototype` mais um scout. Mede:
   - (a) se o marketplace local no repo, com `enabledPlugins` de projeto, carrega o mod num clone
     limpo, e o que a confiança do workspace pede;
   - (b) se um mod em `.claude/skills/<nome>/` carrega sozinho (o atalho do `reference.md`);
   - (c) se carrega na VM do `railway code --claude -- -p` (molde) e no `claude -p` da bancada;
   - (d) se o `tool.call` do mod vê o Bash de um agente de `Workflow` e de um subagente (`agentId`);
   - (e) se o `session.measure`/`usage().cost` inclui o custo dos subagentes;
   - (f) se o plano do MenosJuros é Team ou Enterprise com managed settings e
     `allowManagedModsOnly`;
   - (g) se o PostToolUse do `.claude/settings.json` dispara no tool call de um subagente e de um
     agente de `Workflow`, e se a sessão cloud lê os hooks do projeto.
1. **As travas em settings hook** (§4.5): stash, produção, subagente sem papel. Não é mod e não
   depende do T0. Pode ir já.
2. **`menosjuros-painel` v1** (§4.2, §4.6 e o custo do §4.9): só leitura, sem `$.model`.
3. **O contrato do JSONL de vereditos** no `julgar.mjs` (P8). Depois, o pane de rodadas (§4.8).
4. **Card → canal** (§4.1): a saída em settings hook PostToolUse, assíncrona, com a identidade do
   dev, depois do ajuste da fase 1 do canal; o toast no painel. A entrada com **um agente só**, se o
   P9 confirmar. Depois que o agente rodar fora do Desktop, a saída migra para ele, observando o
   Multica, e o hook sai.
5. **A vigia determinística e a checagem da primeira decisão** (§4.3a e §4.4), como notices na
   banda.
6. **O aviso de resposta no Buzz** (§4.9), depois da fase 2 do canal.

Fica em **nunca, por ora**: o side agent com modelo, o classificador de caminho, a migração do
`contexto-core`, do `pii-guard` e do `regras-por-caminho`, e `prompt.section`, `turn.step`,
`tool.check`, `skill.prompt`.

## 7. Critério de pronto (verificável)

**T0.** Uma nota com a resposta medida de cada item do §6.0, cada uma com o comando e a saída.

**Travas (passo 1).** `node --test scripts/hooks/travas.test.mjs` passa e prova estes casos:
- `git stash` e `git stash pop` saem com exit 2;
- `git stash push -u -m x` passa;
- `railway up`, `gcloud run deploy` e o `Agent` com `subagent_type` fora da allowlist saem com
  exit 2;
- `scout`, `reach`, `implement`, `monitoring`, `scout-bug` e `impeccable-*` passam.

O hook fica registrado no `.claude/settings.json` com timeout de 5 s.

**Painel (passo 2).**
- `claude plugin validate .claude/mods/menosjuros-painel --strict --json` sai 0, e a linha `calls:`
  fica dentro desta allowlist: `ui.*`, `command.*`, `state.*`, `store.*`, `process.run` (só
  `multica` e `git`), `fs.read`, `session.usage`, `clock.*`. **Não há `model.*`, `tool.check`,
  `http.*` nem `fs.write`.**
- `claude plugin test .claude/mods/menosjuros-painel` passa, com os testes rodados em
  `['terminal','desktop']`:
  - a banda desenha a chave do card e o domínio a partir de um episódico de fixture;
  - um `tool.call` Bash de `juiz.mjs --gate` com exit 2 vira `refaz` no estado;
  - o mesmo vale com `agentId` de workflow;
  - `/projeto` devolve `{}` e abre o pane;
  - sem superfície (headless), nenhum hook falha.
- Um **gate novo** no `scripts/check-harness-docs.sh` roda o `validate --strict` em toda pasta de
  `.claude/mods/` e barra `tool.check` e `model.*` fora de uma lista explícita.
- O `onboarding.md` e o `npm run doctor` cobrem a instalação e a versão mínima.

## 8. Perguntas abertas (cada uma com recomendação)

**P1. Como o time recebe o mod.**
*Recomendo o marketplace local no repo, com `enabledPlugins` de projeto e um
`claude plugin install … --scope project` por dev no onboarding.* É o caminho documentado. O atalho do
`.claude/skills/<nome>/` só entra se o T0(b) confirmar, e mesmo assim como alternativa.

**P2. O mod é opcional ou obrigatório?**
*Recomendo opcional por construção.* O mod vem ligado no projeto, mas nenhuma regra depende dele
(§3). Quem não instalar perde o painel, e nenhuma trava.

**P3. Card → canal automático: quais eventos postam sozinhos, e por onde?**
*Recomendo que só as transições mecânicas (`in_review` vira `resolvido`/`fatia pronta`) postem
sozinhas, por settings hook PostToolUse, e que os toques com conteúdo continuem explícitos pelo
`canal`.* Isso muda o §5 da `multica-e-buzz` ("quem avisa é quem age"), e por isso é pergunta.

**P4. O custo por card vai ao card?**
*Recomendo uma linha no contrato de monitoramento, no `in_review`*, com tokens e custo em US$ da
sessão Claude e o aviso "não inclui Jev, VM nem Cursor". O número fica visível para o time.

**P5. O side agent com modelo.**
*Recomendo não, por ora.* Primeiro a vigia determinística (§4.4). Ele volta à mesa se, depois de duas
semanas de notices, aparecer uma lacuna que só um modelo pega. O "You should know" embutido fica a
critério de cada dev.

**P6. A política da organização.**
*Recomendo que o Flávio confira no console se o MenosJuros tem managed settings*, porque com
`allowManagedModsOnly` a distribuição passa a ser pelo admin. Sem isso, vale o P1.

**P7. Esconder `general-purpose`, `Explore` e `Plan` do modelo (`agent.offer`).**
*Recomendo depois*, e só depois de a trava do §4.5 rodar duas semanas e mostrar quais tipos a sessão
realmente usa.

**P8. Onde mora o veredito do Jev.**
*Recomendo que o `julgar.mjs` (spec autossuficiente) grave uma linha JSONL por veredito* em
`.claude/state/vereditos.jsonl`, gitignored, com padrão, rodada, card e exit. O painel, o pane de
rodadas e o card leem dali, e o mod não precisa casar string de comando.

**P9. Um agente só no Buzz, revertendo a decisão de 03/10 ("três agentes pequenos, uma função
cada").**
*Recomendo que sim.* Um agente só no Buzz, para a entrada (pedido, resposta, "como está?"), com o
menor privilégio **no `canal.mjs`**: cada função é um comando preso ao agente na tabela do §6, e não
um agente separado. Isso tira o P1 e o T0(d) da spec do canal e reduz o P3 a um membro.

**P10. Com que identidade a saída assina enquanto o agente não está sempre ligado.**
*Recomendo a do próprio dev* (opção 1 do §4.1b): a chave pessoal dele, só para `linha` e `tocar`,
com o rodapé `via sessão · <papel>`. Não há segredo compartilhado. O custo é mudar a regra de
identidade do `canal.mjs`, que hoje recusa chave pessoal. Se o Flávio preferir que nenhuma mensagem
pareça digitada por um humano, fica a opção 2 (uma chave de projeto) até o agente assumir a saída.
