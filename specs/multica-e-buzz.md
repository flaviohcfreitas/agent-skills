# Spec: o card e o canal — como os agentes usam o Multica e o Buzz

> Status: rascunho do reach, 03/10/2026, revisto no mesmo dia. A fase 1 da skill `canal` foi
> construída; o resto não. O **desenho base foi aprovado pelo Flávio** (§2), e a revisão troca os
> quatro agentes no Buzz por **três agentes pequenos do workspace**: Triagem, Escriba e Status (§3). As perguntas abertas estão no fim; as
> recomendações valem como decisão se ele não responder diferente.

## 1. Problema

O pedido: *"O Multica é a ferramenta de gestão de projeto dos agentes, e o Buzz é a de comunicação e
relacionamento dos agentes e humanos. Crie a forma dos agentes usarem essas ferramentas para comunicar
e gerenciar um projeto."* E depois: *"veja como o Multica se integra ao Slack; vamos replicar,
integrado ao Buzz"*. A ênfase do Flávio é que tudo seja **nativo de IA**. O Buzz é como o Slack e o
Multica é como um gestor de projetos, mas os dois são **ferramentas próprias**, e nelas os agentes são
**membros de primeira classe, com identidade própria**. Não é um bot acoplado a uma ferramenta humana.

O que existe hoje:

- **O Multica já tem regra.** A skill `multica` (`~/Sources/agents/skills/multica/SKILL.md`) diz onde
  mora cada artefato (§7), que o agente relata com `--no-start` (§4), que mover a coluna é a
  autorização (§2–3) e como a `to-map` traça o mapa (§8). A superfície se escolhe por duração, e vale
  "trabalho sem rastro no card não aconteceu".
- **O Buzz não tem regra nenhuma no harness.** Nenhuma skill, hook ou workflow nosso fala com ele. A
  única porta é a função de shell `buzzme` (`~/.zshrc:139`), que assina **com a chave pessoal do
  Flávio** (Keychain `buzz-nsec`) no relay `wss://buzz-production-463f.up.railway.app`.
- **Os gates humanos só chegam pela sessão do Claude Code.** São eles: as perguntas do `grilling`
  (`agent.md`), a aprovação dos checks do agent-loop (`specs/loop-karpathy.md:151`, `:158`), a
  autorização de fluxo crítico (`loop-karpathy.md:85`, `:185`), o veredito `humano` do Jev e a 3ª
  volta do laço de refaz, e o merge. Quem saiu de perto do terminal não fica sabendo, e não consegue
  responder.

### 1.1 Como o Multica se integra ao Slack (a fonte primária)

Fontes: `multica-ai/multica`, `apps/docs/content/docs/slack-bot-integration.mdx` e `channels.mdx`;
`server/internal/integrations/slack/outbound.go`; `server/internal/integrations/channel/channel.go`.

- **É um adaptador de chat, e não um notificador.** O Slack serve de **porta de entrada para um
  agente do Multica**: "One Slack app maps to one Multica agent". Para ter vários agentes, um app do
  Slack para cada um.
- **O que ele faz:**
  - DM com o bot, sem menção;
  - @menção num canal, e **cada thread é uma sessão**. O seguimento na thread também precisa de nova
    @menção. O agente lê só as mensagens dirigidas a ele, nunca o canal inteiro;
  - a resposta do agente volta para a mesma thread. O `outbound.go` só posta "on EventChatDone", que
    é a resposta do chat;
  - `/issue <descrição>`: o agente redige e cria o card, e o aviso chega à caixa de entrada do
    Multica;
  - `/new` e `/clear` controlam a sessão de chat;
  - anexo de até 20 MiB, no máximo 10 por mensagem.
- **Como se liga:** um app do Slack por agente, com dois tokens (`xoxb-`, `xapp-`) colados no agente,
  no Multica. A conexão é Socket Mode, de saída, sem URL pública. Antes do primeiro uso, a conta do
  Slack se liga ao membro do Multica por um link; toda mensagem reconfere vínculo e associação.
- **O que ele não faz:** não avisa no canal que um card foi criado, mudou ou recebeu comentário. Não
  faz unfurl de card. Não tem canal por projeto. **O Multica não tem webhook de saída de eventos de
  issue**: o único webhook é o de **entrada**, do autopilot (`autopilots.mdx`, "Run from a webhook"),
  que cria card ou roda agente a partir de um POST JSON.
- **O motor é genérico.** Feishu, Slack, DingTalk, WeCom e Telegram implementam a mesma interface
  `channel.Channel` (`Connect`, `Disconnect`, `Send`, `Capabilities`, `Type`). DingTalk, WeCom e
  Telegram são da comunidade, e o Telegram tem 15 arquivos Go fora os testes. Um adaptador do Buzz
  seria um sexto.
- **Link de card:** `https://multica.ai/{workspaceSlug}/issues/{identifier}` (`channel/issue_link.go`).
  Aqui é `https://multica.ai/menos-juros/issues/MENO-4`. O JSON de `issue get` não traz URL; o link
  se monta.

### 1.2 O que o Buzz oferece (a skill oficial)

A fonte é a skill **oficial**, `block/buzz`, `desktop/src-tauri/src/managed_agents/nest_skill.md`
(cópia em `scratchpad/buzz/oficial.md`). A local, `~/.buzz/.agents/skills/buzz-cli/SKILL.md`, de
03/08, está desatualizada e ainda ensina polling.

- **Agente gerenciado (managed agent):** o Buzz Desktop roda o agente, com nome, system prompt,
  runtime e chave próprios. **Uma @menção o acorda.** A oficial, de 30/09/2026, manda não fazer loop
  nem sleep: o que chegou se lê uma vez, com `messages get --since <created_at>`. Nesta máquina já
  existem três (`~/Library/Application Support/xyz.block.buzz.app/agents/managed-agents.json`): Honey,
  Pollen e "meu agente". Os três rodam Claude (`buzz-acp` com `claude-agent-acp`), no relay de
  produção, com `respond_to` `allowlist` ou `anyone`. **O Buzz já trata agente como membro com
  identidade.**
- **Quem pode acordar o agente se configura no próprio agente:** `respond_to`
  (`owner-only | anyone | allowlist`) e `channels set-add-policy`.
- **Criar e mudar agente passa pelo dono:** `buzz agents draft-create|draft-update` abre um formulário
  no Desktop do dono, e só o dono salva. Exige `BUZZ_AUTH_TAG`.
- **As leituras devolvem o evento Nostr assinado inteiro**, com `pubkey` e `sig` (26/08/2026). Dá para
  provar quem respondeu.
- **A menção só notifica** com `@Nome` em texto puro e `--mention <npub>` no mesmo envio. Nome que não
  resolve, ou que não é membro, para o envio, e enviar nunca muda quem é membro.
- **Canal:** `channels create --name --type stream|forum --visibility open|private`, `purpose`,
  `topic`, `add-member --role`, `archive`, `unarchive`. Thread: `messages send --reply-to`. Mensagem em
  GFM, até 65.536 bytes. Anexo: `--file`.
- **O que sai do time:** `messages send --broadcast` e `social publish` publicam na rede Nostr
  pública.
- **Nenhum guarda de PII**, nem na CLI nem na skill.

### Homônimo

"Buzz", aqui, é o app de chat do time (relay Nostr, Buzz Desktop). **Não** é o bot de parceiros do
MenosJuros que também se chama Buzz (o ex-Legolas dos grupos "Menos Juros & …").

## 2. Decisão: o desenho base (aprovado)

**O card é a verdade; o canal é a conversa.**

1. **Um esforço tem um projeto no Multica e um canal no Buzz, com o mesmo nome.** Os dois nascem
   juntos quando a `to-map` começa. O propósito do canal leva o link do projeto, e o projeto leva o
   link do canal.
2. **O Multica guarda o estado**: o mapa, os tickets, as decisões e os bloqueios. **O canal guarda a
   conversa**: as perguntas, os avisos e os handoffs. A mensagem **aponta para o card e nunca repete
   o conteúdo dele**.
3. **Durante o mapa**, num ticket de grilling, o reach pergunta, e as perguntas chegam ao canal pela
   voz do Status, @mencionando o humano (§3). A resposta do humano, com @menção, **acorda o
   agente**, como a oficial manda, sem polling.
   Quando um ticket é resolvido, vai ao canal uma linha com o link do card. Quando o monitoring dá
   `humano`, vai o motivo, com o link.
4. **Na construção**, a fatia pronta e o PR esperando merge viram linhas no canal.
5. **No fim**, o canal é arquivado e o projeto fecha no Multica.
6. **Gates.** O canal só se cria sem perguntar quando o próprio usuário disparou a `to-map`. Convidar
   gente de fora do time pede aprovação. PII nunca vai ao canal (§6).
7. **O ganho:** os gates humanos passam a funcionar fora da sessão do Claude Code.

As regras que este rascunho acrescenta ao desenho base:

- **O Buzz é o nível do projeto; o Multica é o nível do dev.** No Multica trabalham os quatro agentes
  de cada dev (scout, reach, implement, monitoring), na sessão dele. No Buzz falam **três agentes
  pequenos do workspace, cada um com uma função** (§3): Triagem, Escriba e Status. Os quatro
  trabalhadores ficam por dentro, e o que eles fazem chega ao humano pela voz do Status.
- **Uma thread por card**, dentro do canal do esforço. A thread nasce na primeira mensagem sobre o
  card. A raiz termina com `card: <KEY>` e o link do card.
- **Os vínculos são links de mensagem.** O Buzz **não tem link de canal**: o único link navegável é de
  mensagem, `buzz://message?channel=<UUID>&id=<EVENT_ID>&thread=<ROOT_ID>` (skill oficial e
  `buzz messages thread --help`). Por isso:
  - **projeto → canal:** o `abrir` posta no canal a **porta**, uma mensagem com o nome e o link do
    projeto. A descrição do projeto guarda `Canal: buzz://message?channel=<UUID>&id=<porta>`, que abre
    o canal e serve ao script, porque o id do canal está dentro do link;
  - **canal → projeto:** o propósito do canal, `Projeto: <link do projeto>`;
  - **card → thread:** o metadado `buzz_thread` do card guarda o link da raiz,
    `buzz://message?channel=<UUID>&id=<raiz>&thread=<raiz>`;
  - **thread → card:** a linha `card: <KEY>` e o link do card, no fim da raiz.
- **Duas formas de mensagem**, e só uma delas chama alguém:
  - a **linha** é um aviso sem menção: ticket resolvido, fatia pronta;
  - o **toque** é um pedido de ação, **com** @menção do dev que disparou o trabalho: pergunta,
    `humano`, PR para merge.
  Achado de scout, refaz da 1ª ou da 2ª volta e `passou` no meio das ondas não vão ao canal; vão ao
  card como comentário, como já vão hoje.
- **Nada vive só no Buzz.** Resposta dada no canal vale quando está no card, como comentário
  transcrito pelo Escriba.
- **Do Buzz, só canal, mensagem, thread, reação e membros.** `issues`, `projects`, `canvas`, `notes`,
  `mem`, `repos`, `patches`, `workflows` e `social` ficam de fora: trabalho é do Multica, conhecimento
  é do vault `memory/`, código é do GitHub.
- **Vários devs.** Nada é fixo em uma pessoa: o toque menciona o dev da sessão, e o time vem da
  configuração.

## 3. Nativo de IA: três agentes pequenos, uma função cada

**No Buzz, os membros agentes são funções de um time de produto, e não os quatro trabalhadores.** Cada
uma é um **agente gerenciado do Buzz**, um só para o **workspace** (e não um por projeto), com chave
própria e membro (`bot`) de todo canal de esforço. É o que o Multica faz no Slack, um bot por agente,
mas nativo do Buzz: chave própria e acordado por menção. **Uma função por agente** deixa a instrução
de cada um curta, e o que cada um pode tocar fica fácil de conferir.

| Agente | Escreve no | Faz | Nunca |
|---|---|---|---|
| **Triagem** | Multica | acordado por `@Triagem <pedido>` no canal, cria um **card parado** (`issue create --project <do canal> … --no-start`) com domínio e tipo, e responde na thread com o link. A thread do pedido vira a thread do card (`buzz_thread`). Se o pedido é vago, **pergunta antes de criar** | criar sem domínio e tipo; disparar run |
| **Escriba** | Multica | mantém os cards em dia: **transcreve** no card a decisão ou a resposta dada no canal (§4.1) e **liga o PR ao card** (comentário com o link e o metadado `pr`). Reage ✅ na thread | **fechar card** (`done` e `cancelled` são do humano); mudar status ou coluna; disparar run |
| **Status** | Buzz (só lê o Multica) | responde "como está?", "o que ficou pronto?", "o que está travado e por quê?" e "o que precisa de mim?", sempre com o link de cada card. É a **voz dos avisos**: as perguntas do grilling, os checks, o crítico, o `humano`, a fatia pronta e o PR esperando merge (§5). Abre e arquiva o canal | escrever no Multica |

Triagem e Escriba escrevem no Multica e seguem as regras dos agentes: tudo com `--no-start`, PII
barrada pelo script, nunca fechar card e nunca mover card de outro (`multica` §4).

Depois, na mesma forma, ficam fora da v1: **Cobrador** (lembra decisões pendentes), **Design**
(`DESIGN.md`, o sidecar da `impeccable`, protótipos), **Domínio** (as docs em `dominios/`) e
**Entrega** (merge, deploy, soak).

**Nenhum dos três decide nem constrói.** Quem retoma o trabalho a partir de uma resposta é o reach ou
o implement do dev, na sessão dele, lendo o card.

**Quem posta como o Status quando o trabalho é de um dev.** A sessão do dev roda o `canal.mjs`, que
**assina com a chave do Status** guardada no Keychain do dev. O aviso sai na hora em que o trabalhador
age, mesmo com o Status desligado. A decisão é a P1(a): a chave de cada agente vai para o Keychain de
cada dev (`buzz-triagem`, `buzz-escriba`, `buzz-status`). Na prática, a sessão só usa a do Status. O
T0(d) diz se isso é possível; se não for, vale o (b).

**Quem acorda os três:** qualquer pessoa do time. O `respond_to: allowlist` de cada um, no Desktop, é
a lista de `humanos` da configuração. Gente de fora não os acorda.

**Onde rodam.**

- **Já, no T0:** no Buzz Desktop do Flávio, como os agentes gerenciados que já existem lá (plano B).
  Só respondem com a máquina dele ligada. Os avisos não dependem disso, porque a sessão assina direto.
- **A meta:** uma máquina sempre ligada, como a VM do Railway, que é o padrão dos cloud agents do
  harness. Isso entra quando o T0(f) confirmar que um agente gerenciado do Buzz roda fora do Desktop.

A instrução de cada um mora em `~/Sources/agents/buzz/{triagem,escriba,status}.md` e entra por
`draft-create`/`draft-update`; o dono revisa e salva no Desktop.

## 4. Replicar a integração do Slack no Buzz

| Capacidade do Multica no Slack | Equivalente no Buzz | Já, com o que existe? | Custo |
|---|---|---|---|
| Bot por agente | um agente gerenciado por função: Triagem, Escriba e Status (§3) | **sim**: o Desktop roda agente Claude, e há três | 3 drafts salvos pelo dono |
| @menção no canal acorda o agente, e cada thread é uma sessão | @menção acorda o agente; ele lê a thread uma vez (`messages thread`) | **sim**, é o modelo da oficial; acordar de fato é o T0(b) | a instrução de cada um |
| A resposta volta à mesma thread | `messages send --reply-to <raiz>` | **sim** | — |
| DM com o bot | `dms open` | sim | fora da v1: o canal do esforço cobre |
| Vínculo de conta (Slack → membro do Multica) | `respond_to: allowlist` com os npubs do time, mais a `sig` do evento | **sim**, nativo do Buzz e mais forte (assinatura) | a lista na configuração |
| `/issue <descrição>` cria card | `@Triagem <pedido>`: card parado, com domínio e tipo; pedido vago leva uma pergunta antes | sim: `multica issue create … --no-start` | a instrução; o card nasce parado (`multica` §2) |
| `/new`, `/clear` | a thread nova já é sessão nova | dispensável | — |
| Anexo | `--file` (Blossom) | sim | fora da v1 |
| Resposta do agente sai no fim do run | o agente posta quando termina | sim | — |
| — (o Multica não tem) **canal por projeto** | `channels create` + a porta + `purpose` com o link do projeto | **sim**, pelo script, como Status | §7 |
| — (o Multica não tem) **avisar no canal que algo mudou no card** | linha e toque, postados **pela sessão do dev, como o Status**, no mesmo passo em que o trabalhador muda o card | **sim**, pelo script | §7. Sem webhook de saída, quem avisa é quem age |
| — (o Multica não tem) **"como está o projeto?"** | `@Status` lê o board e responde | sim, se o runtime tem `multica` autenticado (T0c) | a instrução |
| — (o Multica não tem) a resposta vira comentário no card | `@Escriba` transcreve com `canal transcrever` | sim, com o mesmo T0(c) | a instrução |

### 4.1 A resposta do humano

1. Alguém do time responde na thread do card com `@Escriba …`, e a menção acorda o Escriba.
2. O Escriba lê a thread uma vez e acha o card na linha `card: <KEY>` da raiz.
3. Confere o autor: a `pubkey` está em `humanos` e a `sig` confere.
4. Transcreve **literal** no card (`canal transcrever`), com o autor e o link da mensagem.
5. Reage ✅ e responde: "registrado no card; <dev> retoma na sessão".

Quem retoma é o dev, ou o agente dele, lendo o card. Acordar a sessão do dev pelo canal é disparar, e
fica fora (§10).

**O que fica para depois, e por quê:**

- **Adaptador `buzz` dentro do Multica**, um sexto `channel.Channel`, ao lado do Telegram. Daria a
  paridade literal: o agente do **Multica** (no daemon) responderia no Buzz, com a sessão de chat do
  Multica. Custo alto e fora do nosso controle: Go no servidor, e um PR no `multica-ai/multica`,
  porque o Multica é cloud (`api.multica.ai`) e não roda adaptador nosso. Só vale se o caminho nativo
  do Buzz se provar e o PR for aceito.
- **Webhook de saída do Multica para o Buzz:** não existe. Um processo nosso que fizesse polling do
  Multica para avisar no Buzz duplicaria o que o agente já sabe na hora em que age.
- **Buzz → autopilot do Multica por webhook:** é possível, mas Triagem e Escriba já têm a CLI. Fica
  como alternativa se o T0(c) falhar.

## 5. Os momentos do grafo

**No canal, os avisos saem pela voz do Status.** Quem age é o trabalhador do dev, na sessão: ele
escreve no card e roda o `canal.mjs`, que assina como o Status. A mensagem diz de onde veio, no
rodapé (`de: reach · <dev>`). `laco-de-refaz`, `ondas` e `agent-loop-rodadas` continuam devolvendo o
estado à sessão, e não mudam.

| Momento | Quem age | No card (Multica) | No canal, e quem fala |
|---|---|---|---|
| **A `to-map` começa** (disparada pelo usuário) | reach do dev | o projeto (§8 da `multica`), com `Canal: <link da porta>` na descrição | **Status**, `abrir`: canal privado com o nome do projeto, a porta, propósito `Projeto: <link>`, os três agentes (`bot`) e o time (`member`) |
| **Pedido novo no canal** (`@Triagem …`) | Triagem | card parado, com domínio e tipo; `buzz_thread` = a thread do pedido | **Triagem**: o link do card, ou uma pergunta antes, se o pedido é vago |
| **Abrir um card** | quem começa | `status <card> in_progress --no-start`; a spec no corpo | nada |
| **Scout achou** | scout | comentário com endereço; na sessão, o achado vai ao reach | nada |
| **Ticket de grilling: perguntas** | reach | `## Perguntas abertas`, cada uma com a recomendação · `blocked --no-start` · `aguardando=decisao` | **Status**, toque `pergunta` no dev |
| **Alguém responde** (`@Escriba …` na thread) | Escriba | comentário transcrito, literal (§4.1) | **Escriba**: ✅ e "registrado; <dev> retoma" |
| **Ticket resolvido** | reach | decisão, *Decisions so far*, `in_review --no-start` | **Status**, linha `resolvido` |
| **Agent-loop pede aprovação dos checks** | reach | os checks e a saída vermelha · `blocked` · `aguardando=checks` | **Status**, toque `checks` |
| **Fluxo crítico pede autorização** | reach | o que é crítico e por quê · `blocked` · `aguardando=critico` | **Status**, toque `critico` |
| **Fatia pronta** | implement | arquivos, `verificar`, resultado | **Status**, linha `fatia pronta` |
| **Monitoring: refaz (1ª ou 2ª volta)** | monitoring | o que falhou | nada |
| **Monitoring: `humano`** (ou a 3ª volta) | monitoring | o veredito, o motivo e as saídas · `blocked` · `aguardando=humano` | **Status**, toque `humano` |
| **PR esperando merge** | implement | `in_review --no-start` · o PR (no MenosJuros, também o contrato de monitoramento) | **Status**, toque `merge` em quem mergeia |
| **PR aberto fora da sessão** (`@Escriba liga <PR> a MENO-12`) | Escriba | comentário com o link e o metadado `pr` | **Escriba**: ✅ |
| **"Como está?"** (`@Status …`) | Status | lê, não escreve | **Status**: a resposta, com os links |
| **Fim do esforço** | o **humano** fecha o projeto (`done` é dele) | — | **Status**, `arquivar`, só depois de ler o projeto fechado (T0h); `unarchive` desfaz |

**O formato.** A raiz da thread de um card:

```
@Ana pergunta · MENO-12 — <título do card>

1. <pergunta> — recomendo: <x>
2. <pergunta> — recomendo: <y>

Responda aqui com @Escriba.
https://multica.ai/menos-juros/issues/MENO-12
card: MENO-12 · de: reach · Ana
```

A primeira palavra depois da menção é o tipo. A linha não tem menção:
`resolvido · MENO-12 — <título>`, o link e o rodapé. O `@Ana` vai em texto puro e com
`--mention <npub>` no mesmo envio, e nunca em negrito.

## 6. Segurança

**O que cada agente faz sem perguntar** é só o que passa pelo script do canal, e o script amarra
**cada comando a um agente**:

| Comando | Quem pode | O que toca |
|---|---|---|
| `abrir` | Status | cria o canal do esforço, **só** com `--disparado-pelo-usuario` (a sessão só passa a flag quando o usuário disparou a `to-map` naquele turno); posta a porta; põe `purpose` e `topic`; adiciona os três agentes e os humanos da configuração |
| `linha`, `tocar`, `ler` | Status | aviso numa thread de card, mencionando só humanos da configuração; leitura da thread, uma vez por despertar |
| `arquivar` | Status | arquiva o canal depois de ler o projeto fechado |
| `triar` | Triagem | `multica issue create … --no-start` com domínio e tipo no projeto do canal; a resposta na thread |
| `transcrever`, `ligar-pr` | Escriba | comentário e metadado no card (`--no-start`); ✅ na thread |

**Tudo o mais pede gate humano** antes de rodar. Entram aí: adicionar alguém que não está na
configuração (gente de fora do time), DM, canal que não é de esforço, `--broadcast`, `social publish`,
`notes`, `canvas`, `workflows` (o `approve` nunca é de agente), `agents draft-*` (quem salva é o dono),
`repos`, `issues`, `patches`, `projects`, `channels delete`, e editar ou apagar mensagem de outro. No
Multica, qualquer `status` e qualquer `assign` que dispara run. Mensagem que sai do time é ação
visível para outras pessoas.

**Construção, crítico e merge não se autorizam pelo canal.** A resposta no Buzz responde a pergunta
do grilling e aprova checks. Construir é mover a coluna no Multica, autorizar fluxo crítico é na
sessão, e o merge é no GitHub. Card só fecha pela mão do humano.

**Identidade.** Cada agente assina com a chave dele. O script recusa `buzz-nsec` e o Keychain pessoal
de qualquer humano da configuração. A chave nunca aparece em argumento, em log ou na saída ("never
read or echo the value", da oficial). Quem sai do time faz o dono girar as três chaves.

**PII de cliente nunca vai ao Buzz nem ao Multica.**

- **O `pii-guard` não cobre o Buzz, e cobre o Multica só no MenosJuros.** O hook está registrado no
  `.claude/settings.json` do projeto (matcher `mcp__.*[Ll]inear.*|Bash`) e libera todo Bash sem
  `multica` (`scripts/hooks/pii-guard.mjs:52`). O `~/.claude/settings.json` não o registra. Os padrões
  (`scripts/lib/pii.mjs`) pegam CPF e CNPJ formatados, telefone BR e CPF sem máscara perto de "cpf".
  Nome de pessoa, nenhum padrão pega.
- **Camada 1, em todo projeto: o script do canal** roda os mesmos padrões em todo texto antes de
  chamar o `buzz` ou o `multica`, e sai com erro se achar. Os três agentes escrevem só pelo script,
  nunca com o `buzz` ou o `multica` direto. Isso pesa mais na Triagem, porque o pedido no canal vira
  o corpo de um card: com PII no pedido, ela responde "tire o dado do cliente e peça de novo" e não
  cria nada. A resposta do Status cita card pela chave e pelo título, e não copia comentário.
- **Camada 2, no MenosJuros:** o filtro do `pii-guard.mjs:52` passa a ser `\b(multica|buzz)\b`.
- **A regra que regex nenhuma pega:** a mensagem fala do **fluxo**, nunca da **pessoa**. Use a chave
  do card, o fluxo, a tela, o parceiro (empresa); nunca nome de cliente, e-mail ou número de proposta.
  Card com nome de cliente no título vai ao canal só com a chave.
- **Canal privado**, sempre. Canal aberto é visível para todo o relay.

**A configuração é do time, e cada dev tem a sua cópia.** `~/.agents/canal.json` guarda:

- o relay e o slug do workspace do Multica;
- `humanos`: o time, com nome → `pubkey`, `email` (é assim que o script acha o dev da sessão) e
  `merge`;
- `papeis`: **os três agentes**:
  `{ "Triagem": { "pubkey", "keychain": "buzz-triagem" }, "Escriba": { …, "buzz-escriba" }, "Status": { …, "buzz-status" } }`;
- `dono`: quem criou os agentes gerenciados no Desktop.

O agente lê esse arquivo e não o edita (deny de `Edit`/`Write` no `~/.claude/settings.json`). O
`respond_to: allowlist` de cada agente, no Desktop, é a lista de `humanos`.

## 7. Onde a regra mora

**A skill global `canal`, em `~/Sources/agents/skills/canal/`.** Ela **já foi construída** na fase 1,
com papéis configuráveis, e há um implement corrigindo a volta 1 agora. **Esta revisão não a edita.**
O que muda nela, num ticket depois da volta 1:

| Onde | Hoje | Passa a |
|---|---|---|
| `canal.example.json` | `papeis` com Scout, Reach, Implement e Monitoring; `dono` "quem criou os 4 agentes" | `papeis` com `Triagem`, `Escriba` e `Status` (`buzz-triagem`, `buzz-escriba`, `buzz-status`); `humanos` com mais de um dev no exemplo |
| `--papel` | obrigatório, um dos 4 | **continua obrigatório**, um dos três; o script recusa o par comando × papel fora da tabela do §6. Um novo flag `--de <reach\|implement\|monitoring>` vai para o rodapé `de: <papel> · <dev>` |
| `abrir` | assina como `Reach`; adiciona os 4 como `bot`; grava `Canal: buzz:<id>` | `--papel Status`; adiciona os três de `papeis`; **posta a porta** e grava `Canal: buzz://message?channel=<id>&id=<porta>` na descrição do projeto |
| metadado `buzz_thread` | o id da raiz | o **link** da raiz, `buzz://message?channel=…&id=<raiz>&thread=<raiz>`; o script tira o id do link |
| raiz da thread | "Responda aqui com @Reach" | "Responda aqui com @Escriba" e o rodapé `card: <KEY> · de: <papel> · <dev>` |
| `ler` e `arquivar` | assinam como `Reach` | `--papel Status`; `arquivar` aceita só o status de fechado medido no T0(h) |
| (novo) `triar --pedido <link da mensagem> --dominio <d> --tipo <t> --titulo - --texto -` | — | fase 2, Triagem: PII barrada; `issue create --project <do canal> --no-start`; `buzz_thread` = a thread do pedido; responde com o link |
| (novo) `transcrever --card <KEY> --evento <id>` | — | fase 2, Escriba: confere o autor em `humanos` e a `sig`; comenta no card o texto literal, o autor e o link; ✅ |
| (novo) `ligar-pr --card <KEY> --pr <url>` | — | fase 2, Escriba: comentário com o link e `metadata set <KEY> --key pr` |
| `SKILL.md`, tabela dos momentos | a coluna do canal nomeia Reach, Implement e Monitoring | a tabela do §5: "quem age" e "quem fala" |
| `SKILL.md`, "Quando o agente é acordado" | os agentes do dev | os três, acordados por qualquer pessoa do time, cada um na sua função |

E fora da skill:

- `~/Sources/agents/buzz/{triagem,escriba,status}.md`: a instrução de cada um (§3), curta. Os três
  leem o Multica com o `multica`, escrevem só com o `canal` e não fecham nem movem card. O Status não
  escreve no Multica.
- **A `multica` ganha dois ponteiros**: no §4, "parou esperando humano: `blocked --no-start`,
  `aguardando` e a `canal`"; no §8, "criado o projeto, `canal abrir`".
- **O `agent.md` ganha o ponteiro**: na tabela "O modo", "todo gate humano escreve no card e avisa no
  canal (`canal`)". E uma linha que fixa os níveis: "o Multica é do dev, onde trabalham os quatro; o
  Buzz é do projeto, onde falam Triagem, Escriba e Status".

Por que assim, pela `writing-for-agents`: há fonte única (a regra atravessa a `to-map`, o grilling, o
agent-loop, o laço de refaz, as ondas e o merge, e cada lugar aponta para a skill); a `buzz-cli` é do
Buzz e não se edita; a skill é model-invoked, porque a sessão e os três agentes a alcançam sozinhos; e
o par **card / canal** carrega a regra em duas palavras.

## 8. O que muda, e onde

| # | Onde | O que | Fase |
|---|---|---|---|
| 0 | — | **T0, medida** (abaixo) | antes |
| 1 | `~/Sources/agents/skills/canal/` | **feito** (fase 1); falta o ajuste do §7 (`abrir`, `linha`, `tocar`, `ler`, `arquivar` como Status), depois da volta 1 | 1 |
| 2 | `~/.agents/canal.json` | a cópia de cada dev, a partir do exemplo; quem preenche é o humano | 1 (humano) |
| 3 | `~/.claude/settings.json` | deny de `Edit`/`Write` em `~/.agents/canal.json` | 1 (gate: config) |
| 4 | `~/Sources/agents/skills/multica/SKILL.md` §4 e §8 | os dois ponteiros, depois do implement do §8 | 1 |
| 5 | `~/Sources/agents/agent.md` | o ponteiro e a linha dos níveis | 1 |
| 6 | MenosJuros `scripts/hooks/pii-guard.mjs:52` | `\b(multica\|buzz)\b`, com teste | 1 (PR no monorepo) |
| 7 | `~/Sources/agents/buzz/{triagem,escriba,status}.md` (novos) + `canal triar`, `transcrever`, `ligar-pr` | a instrução dos três e os comandos de quem escreve no Multica | 2 |
| 8 | Buzz Desktop do Flávio | **os três**: o dono salva os drafts com `respond_to: allowlist` = o time, e entrega as chaves a cada dev | 2 (humano) |
| 9 | uma máquina sempre ligada (VM do Railway) | os três saem do Desktop, se o T0(f) confirmar | depois |

A **fase 1** dá o canal, as linhas e os toques, pela voz do Status: o dev fica sabendo fora da sessão
e responde no card. A **fase 2** dá a Triagem, o Escriba e o Status acordado por menção.

**T0, medida antes da fase 2** (um scout só leitura, mais um teste manual do dono no Desktop, criando
**os três**):

- (b) se uma resposta **na thread** à mensagem do Status acorda o Escriba **sem** @menção, ou se só a
  menção acorda;
- (c) se o runtime do agente gerenciado (`claude-agent-acp`, no nest `~/.buzz`) roda `multica`
  autenticado e enxerga as skills globais (`~/.claude/skills`);
- (d) se a chave de um agente gerenciado sai do Desktop para o Keychain dos devs (exportar), ou se uma
  chave criada fora entra no Desktop (importar). Se nenhuma das duas, a sessão do dev não posta como o
  Status, e vale a P1(b);
- (e) que `--type` o `multica project resource add` aceita além de `github_repo` e
  `local_directory`. Se aceitar link, o link da porta vai como recurso do projeto; se não, fica a
  linha `Canal:` na descrição;
- (f) se um agente gerenciado do Buzz roda **fora do Desktop**, sem tela, numa VM. Se rodar, o passo
  seguinte é levar os três para a VM do Railway (padrão dos cloud agents do harness); se não, ficam no
  Desktop do Flávio;
- (g) **com que identidade do Multica** Triagem e Escriba escrevem. O `multica` do Desktop está logado
  como o Flávio, e um card criado pela Triagem sairia como se ele o tivesse criado. Mede se o
  workspace aceita um membro ou uma credencial própria para eles (ver P3);
- (h) quais status de projeto o `multica project status` aceita, e qual deles é "fechado". Até agora
  só se viu `planned`. O `arquivar` depende disso;
- (i) onde mora o "domínio" e o "tipo" de um card: propriedade customizada (`issue property set`) ou
  label. A Triagem usa o que já existir no workspace e não cria propriedade nem label sozinha.

(O formato do link do card já está medido: §1.1.)

## 9. Critério de pronto (verificável)

**O ajuste da fase 1 (§7), testado por papel:**

1. `node --test ~/Sources/agents/skills/canal/scripts/canal.test.mjs` passa, com `buzz` e `multica`
   **falsos** no `PATH`, que gravam o argv. Casos novos ou mudados:
   - **Status**: `abrir`, `linha`, `tocar`, `ler` e `arquivar` com `--papel Status` assinam com o
     Keychain `buzz-status`. Os mesmos comandos com `--papel Triagem` ou `--papel Escriba` saem ≠ 0 e
     não chamam nada. Sem `--papel` também saem ≠ 0;
   - `abrir`: `channels create --visibility private`, um `messages send` (a porta) com o link do
     projeto, `channels purpose`, um `add-member --role bot` para cada um dos três **e nenhum outro
     agente**, um `add-member --role member` por humano do time, e a descrição do projeto com
     `Canal: buzz://message?channel=<id>&id=<id da porta>`;
   - dois devs em `humanos`: com `CANAL_DEV=Ana`, o toque menciona a Ana; com `CANAL_DEV=Bia`, a Bia;
     o `merge` menciona quem tem `merge: true`;
   - o primeiro toque grava em `buzz_thread` o link da raiz; o segundo lê esse link e usa
     `--reply-to <raiz>`;
   - `--de reach` põe `de: reach · <dev>` no rodapé; um `--de` fora de `reach|implement|monitoring`
     sai ≠ 0;
   - qualquer dos três com `buzz-nsec` ou com o Keychain pessoal de um dev: sai ≠ 0 e nada é enviado;
   - `arquivar` com o projeto em status diferente do fechado do T0(h): sai ≠ 0.
   - Continuam valendo os casos da fase 1: PII bloqueia antes de qualquer chamada, humano e tipo fora
     da configuração saem ≠ 0, nenhum subcomando proibido, a chave nunca aparece.
2. `grep` acha os ponteiros no `agent.md` e na `multica`.
3. No MenosJuros, o teste do `pii-guard` bloqueia `buzz messages send … 123.456.789-09` e libera
   `buzz messages get` sem PII.
4. **Ponta a ponta (gate humano)**, num projeto de teste: o `abrir` cria o canal privado, e a linha
   `Canal:` do projeto abre o canal na porta. Um toque do Status notifica o dev da sessão, e a thread
   mostra a raiz com `card:`, o link e o rodapé `de:`.

**Fase 2, testado por papel:**

5. **Triagem**: `triar` chama `issue create` com `--project` do canal, domínio, tipo e `--no-start`,
   grava `buzz_thread` e responde com o link do card. Sem domínio ou tipo, sai ≠ 0 e não cria. Com PII
   no texto, sai ≠ 0, não cria e não responde com o dado. Nenhum argv da Triagem contém `status`,
   `assign` ou `comment add`.
6. **Escriba**: `transcrever` com autor fora de `humanos`, `sig` inválida ou raiz sem `card:` sai ≠ 0 e
   não escreve. Com um evento válido de **qualquer** dev do time, o comentário tem o texto **byte a
   byte**, o autor e o link da mensagem. `ligar-pr` grava o comentário e o metadado `pr`. **Nenhum argv
   do Escriba contém `status`** (nem `done`, nem `cancelled`) **nem `assign`**.
7. **Status**: nenhum argv do Status chama `multica` com subcomando de escrita (`create`, `update`,
   `status`, `assign`, `comment add`, `metadata set`). Na fase 1, o `abrir` grava a linha `Canal:` no
   projeto, e é a única exceção.
8. **Ponta a ponta**: um dev escreve `@Triagem a tela X trava ao salvar` e recebe o link de um card
   parado, com domínio e tipo. Responde `@Escriba 1: sim` numa thread de pergunta, e o comentário
   transcrito aparece no card. Pergunta `@Status como está?` e recebe os cards abertos, os bloqueados
   com o motivo e o que espera alguém do time, cada um com o link, sem comentário copiado. Nenhum
   status e nenhuma coluna se mexem.

## 10. Fora

- **Cobrador, Design, Domínio e Entrega.** Entram depois, na mesma forma: um agente, uma função.
- Os três fora do Desktop (VM do Railway), até o T0(f).
- O adaptador `buzz` dentro do Multica (§4).
- DM, anexo e medida disparada pelo canal.
- Acordar a **sessão** do dev pelo canal: escrever no painel pelo `herdr`, ou mencionar o agente do
  Multica para disparar run. Os dois são disparar, e pedem gate próprio.
- Resumo diário. O Status responde quando perguntado, e o estado se lê no board.
- Levar a `canal` para o `.claude/skills/` do MenosJuros (`npm run skills:sincronizar`). É ticket do
  monorepo.
- Limite de mensagens por hora, só se o barulho aparecer.

## 11. Perguntas abertas

**P3. Com que identidade Triagem e Escriba escrevem no Multica.** O T0(g) mede o que o workspace
aceita.
*Recomendo um membro próprio no Multica para cada um*, se o workspace aceitar. Assim o card criado pela
Triagem não aparece como do Flávio, e o board mostra quem escreveu. Se não aceitar, eles escrevem com
o login de quem hospeda o Desktop, e todo texto deles começa com `Triagem:` ou `Escriba:`. Isso muda
a quem o Multica atribui o trabalho, e por isso é pergunta.

## Decididas em 03/10/2026

- A skill se chama `canal`. A fase 2 entra depois da fase 1 e do T0. Uma resposta no canal vale para
  responder o grilling e aprovar checks, nunca para construir, fluxo crítico ou merge. O adaptador
  `buzz` dentro do Multica fica para depois.
- **O Buzz é o nível do projeto e o Multica é o nível do dev.** Esta decisão substitui "quatro agentes
  gerenciados, um por papel", "agentes por dev" e "um Gerente com três funções". No Buzz há **três
  agentes pequenos do workspace, uma função cada**: **Triagem** (pedido → card parado), **Escriba**
  (resposta e PR → card; nunca fecha card) e **Status** (só lê; responde e é a voz dos avisos).
  Cobrador, Design, Domínio e Entrega vêm depois, na mesma forma. Os quatro trabalhadores ficam no
  Multica, na sessão de cada dev.
- **P1 = (a):** a chave de cada agente vai para o Keychain de cada dev, e a sessão posta como o agente.
  O T0(d) decide se é possível; se não for, vale o (b): uma identidade de sessão por dev, que só
  menciona o agente.
- Os três rodam no Desktop do Flávio no T0, e a meta é uma máquina sempre ligada. São vários devs, e
  nada fica fixo no Flávio no código.

### Decidida em 03/10/2026 — P3

**Triagem e Escriba escrevem no Multica com um membro próprio cada**, se o workspace aceitar membros que não são pessoas (o T0(g) mede). Se não aceitar, escrevem com o login de quem hospeda o Desktop, e todo texto deles começa com `Triagem:` ou `Escriba:`.
