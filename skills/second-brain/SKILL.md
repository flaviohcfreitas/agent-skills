---
name: second-brain
description: Opera o vault Obsidian "Second Brain" do Flávio — onde cada coisa mora (PMARIA + Daily), a governança em Memoria/Contratos, e o protocolo de MEMÓRIA COMPARTILHADA (Letta) que todo agente segue para gravar aprendizados sobre o Flávio e sobre os projetos. Use em QUALQUER sessão que leia ou escreva no vault, ao registrar decisão/correção/pessoa/conceito, ou ao perguntar "o que já sabemos sobre X".
---

# Second Brain — como trabalhar neste vault

O vault é a memória de longo prazo do Flávio **e** de todos os agentes que trabalham com ele.
Esta skill dá três coisas: (1) o **mapa** — onde cada coisa está; (2) a **governança** — o que
pode e não pode; (3) o **protocolo de memória** — como cada aprendizado vira memória
persistente, sessão após sessão, sobre ele e sobre os projetos.

A fonte canônica é `AGENTS.md` na raiz do vault + `Memoria/Contratos/`. Esta skill é o atalho
operacional; em conflito, **o vault vence** — e você registra o conflito (ver §Contradição).

## 0. Onde está o vault

| Onde | Caminho | Nota |
|---|---|---|
| Mac (Claudian / iCloud) | `/Users/box76/Library/Mobile Documents/com~apple~CloudDocs/Second Brain` | é onde o Claudian roda hoje |
| Mac (regras.md #6) | `/Users/box76/Second Brain/` | citado em Contratos; **conflito registrado 2026-09-20** — confirmar qual existe antes de escrever |
| VM (canônico por Contratos) | `/home/box/Second Brain/` | `ob sync --continuous`; preferir se estiver nela |

Sempre caminho **absoluto**. Nunca criar segunda cópia nem dual-write. Se o Sync estiver morto
e a VM inacessível: **parar e avisar** (regra 18).

## 1. Antes de qualquer coisa — leitura obrigatória (≈5 min)

Nesta ordem, definida em `Memoria/Contratos/00-indice.md`:

```
Memoria/Contratos/me.md        quem é o Flávio (o filtro de tudo)
Memoria/Contratos/regras.md    o que é proibido (18 regras numeradas)
Memoria/Contratos/memory.md    temporada atual: projetos vivos, foco
Memoria/Contratos/voz.md       como ele escreve (só se você redigir algo que ele assine)
Memoria/Contratos/padroes.md   como o trabalho acontece
Memoria/Contratos/operacao.md  quem escreve onde (tabela por agente)
```

Depois, **recall** — o que outros agentes já fizeram:

```bash
tail -40 "Memoria/log.md"                       # o que foi gravado recentemente
cat "Daily/logs/$(date +%F).md" 2>/dev/null     # o que já aconteceu hoje
cat "Memoria/_index.md" "Memoria/Entidades/_index.md"
cat "Memoria/AI Team/agentes.md"                # quem são os outros agentes
```

Dois clientes (Claudian e Agent Client) podem editar o mesmo arquivo sem se ver. O fim do
`log.md` é o que evita trabalho cego.

## 2. Mapa — onde cada coisa mora (PMARIA + Daily)

Raiz **fechada**: `Projetos/ Memoria/ Areas/ Recursos/ Inbox/ Arquivado/ Daily/` + `AGENTS.md`
`CLAUDE.md` `.obsidian` (+ `Home.md`). Qualquer outra pasta na raiz: **recusar e avisar**.

| Pasta | O que é | Você encontra |
|---|---|---|
| `Projetos/` | trabalho com resultado nesta temporada (máx ~15–20) | `imunizar/` (Iza, clínica — **clone git, ~30k arquivos, não varrer**), `Conteudo-profissional/` (pipe de posts), `Menos Juros/` (notas PM) |
| `Memoria/` | camada **estável e compartilhada** | `Contratos/` (core memory) · `AI Team/` (roster) · `Skills/` (procedimentos) · `Entidades/` (arquival) · `log.md` (journal) |
| `Areas/` | responsabilidade contínua | `Profissional/` (CV, posicionamento, **wiki LLM** em `wiki/`, com `SCHEMA.md` próprio) · `Teologo/` (`knoledge/` grafo + `Legacy/` esboços) · `Menos Juros/` (ponteiro para o repo) |
| `Recursos/` | reaproveitável | `templates/` (`T- D- I- A- Q- E- L-`) · `automacoes/` (wacli, hermes-memoria…) |
| `Inbox/` | captura crua | **vazia é o estado correto** |
| `Arquivado/` | morto mas recuperável | ORBTI, leftovers do Sync |
| `Daily/` | a mesa do dia | `notes/` (**humano**) · `logs/` (**agentes**) · `journal/` · `planner/` · `scratchpad.md` |

**Teste de arquivo, nesta ordem:** projeto ativo → é do dia (`Daily/`) → é entidade da vida
(`Memoria/Entidades/`) → memória estável (`Memoria/`) → área → reusável → não sei (`Inbox/`) → morreu.

Onde vai um **conceito novo**:
- Agent Design / IA / engenharia → `Areas/Profissional/wiki/` (ler `SCHEMA.md` antes; ingest → `raw/` → `wiki/sources/` → páginas; toda página no `index.md`, toda ação no `log.md` da wiki)
- Teológico → `Areas/Teologo/knoledge/`
- Tudo o mais → `Memoria/Entidades/topics/`

Fora do vault, mas apontado por ele: código Menos Juros em `/Users/box76/Sources/menos-juros`
(`Areas/Menos Juros/repo-menos-juros.md`); WhatsApp via `wacli` (`Memoria/Skills/wacli.md`).

## 3. Governança — o que não se negocia

- **Só o agente "Second Brain" edita `Memoria/Contratos/`, `Memoria/AI Team/` e `Memoria/Skills/`, e só ele reorganiza pastas** (regras 16–17). Você lê e obedece. Achou erro? **Proposta**, nunca correção na surdina (§6).
- **Cada agente escreve só no caminho da sua skill** (tabela em `operacao.md`) **mais** os três comuns a todos: `Memoria/Entidades/`, `Memoria/log.md`, `Daily/logs/`.
- `Daily/notes/` é a mesa **humana**. Agente nunca grava ali. Log de sessão vai em `Daily/logs/`.
- **FUT — uma informação, um lugar** (regra 2). Existe → atualiza. Não cria o segundo.
- Não inventar métrica, URL, regra de produto, citação (11). Não publicar em rede sem ok explícito (12). Não misturar pessoal ≠ Menos Juros ≠ ORBTI (13).
- PII, dado de cliente, texto de mensagem de WhatsApp: **nunca** em `Memoria/` sem pedido de export.
- Só o agente **WhatsApp** roda `wacli send`; os outros pedem a ele. Leitura: `wacli --read-only --json`.
- Nomes de nota: minúsculas-com-hífens (exceto dailies `YYYY-MM-DD`). Todo arquivo começa com frontmatter YAML.
- Colisão: `Daily/notes/2026-09-20.md` e `Daily/journal/2026-09-20.md` têm o mesmo nome — linkar com path completo `[[Daily/notes/2026-09-20]]`.

## 4. Memória — o protocolo (o coração desta skill)

Modelo Letta/MemGPT em pastas:

| Camada | Aqui | Quem escreve |
|---|---|---|
| Core (sempre em contexto) | `Memoria/Contratos/` + `AI Team/` | só Second Brain |
| Arquival (longo prazo, buscável) | `Memoria/Entidades/` · `Areas/Profissional/wiki/` · `Areas/Teologo/knoledge/` | **qualquer agente**, por este protocolo |
| Procedural | `Memoria/Skills/` | Second Brain (você propõe) |
| Recall (episódica) | `Daily/logs/` | agente |
| Journal | `Memoria/log.md` | qualquer agente, append-only |

**A regra que resume tudo:** se você aprendeu, criou ou alterou algo que **outro agente,
amanhã, sem este chat**, precisaria para não errar → tem que estar em `Memoria/` antes de você
encerrar. O que fica só no chat morre com a sessão.

### 4.1 O que guardar — o teste de 3 segundos

| Sinal na sessão | Guarda? | Onde |
|---|---|---|
| Flávio **corrigiu** ("não é assim", "não faz X", "isso não sou eu") | **sempre, na hora** | proposta para Contratos (`Daily/logs` §Propostas) + `log.md` |
| **Preferência / restrição** dele que apareceu (horário, tom, ferramenta, o que odeia) | sempre | proposta para `me.md` / `padroes.md` |
| **Decisão** tomada, com motivo | sempre | `Daily/logs` §Decisões; se define rumo duradouro → `Entidades/goals/` |
| **Pessoa** nova que importa | sim | `Entidades/contacts/` |
| **Conceito / tema** em 2+ contextos, ou central ao trabalho | sim | `Entidades/topics/` (IA → wiki; teologia → Teologo) |
| **Padrão** — jeito de fazer que se repetiu | sim | proposta para `padroes.md` ou `Skills/` |
| **Contradição** com a memória | sempre | as duas versões + `conflito: true` + `log.md` |
| Meta, hábito, âncora de vida explícita | sim | `goals/` `habits/` `key-elements/` |
| **Progresso / estado** de algo em curso | não em Memoria | `Daily/logs/` |
| Fato de uma vez só · output de ferramenta · rascunho | não | `Daily/logs/` ou `scratchpad.md` ou nada |
| O que já está na fonte (repo, Linear, WhatsApp) | não | link para a fonte |
| O que já está em Contratos | não | FUT — proposta, não duplicata |
| Opinião sua sem evidência | não | — |

Na dúvida entre `topics/` e `Daily/logs/`: **logs**. Promover depois é barato; poluir a memória
compartilhada custa a todos.

### 4.2 Quando gravar — quatro momentos

1. **Na hora, não depois.** Correção, decisão, contradição, pessoa nova: grava **no instante**,
   antes de continuar a tarefa. A sessão pode morrer a qualquer momento.
2. **Antes de compactar ou resumir contexto.** Despeje o que passou no teste antes de encolher.
3. **Ao encerrar.** Checkpoint obrigatório (§7). Sem ele a sessão não terminou.
4. **Antes de opinar sobre algo que depende de memória.** Ler: fim do `log.md`, a entidade, o
   `Daily/logs` de hoje. Recall vem antes de opinião.

### 4.3 O loop de escrita (toda vez)

```bash
# 1. BUSCAR ANTES DE CRIAR (regra FUT)
grep -ril "<termo>" "Memoria/Entidades" | head        # ou: obsidian search query="<termo>" path="Memoria/Entidades"
grep -rl "^tipo: topic" "Memoria/Entidades/topics" | xargs grep -li "<termo>"
# existe → EDITAR aquele arquivo: bump `atualizado`, acrescentar fonte, corrigir texto.
```

2. **Passou no teste?** Confira a tabela 4.1. "sempre" grava agora; "sim" grava se passou nos
   3 segundos; "não" fica em `Daily/logs/` ou em lugar nenhum.

3. **Escreva pelo template** de `Recursos/templates/E-template-<tipo>.md`. Frontmatter completo
   **mais os três campos de proveniência** — sem eles a nota é inválida:

```yaml
---
title: "nome-do-conceito"
tipo: topic            # goal | habit | topic | key-element | contact
status: active
atualizado: 2026-09-20
agente: "Claude (Claudian)"          # quem gravou
fontes: ["Daily/logs/2026-09-20.md", "conversa com Flávio 2026-09-20"]
confianca: high        # high | medium | low
areas: []
---
```
   Mínimo **2 `[[wikilinks]]`** de saída. Adicione a nota ao `_index.md` da subpasta.

4. **Contradição?** Não sobrescreva. Mantenha as duas afirmações, cada uma com data e fonte,
   `conflito: true` no frontmatter, linha no `log.md` com `conflito`. O Second Brain arbitra no
   review (~18:33, dias úteis).

5. **Uma linha em `Memoria/log.md`** (append; abra seção `## YYYY-MM-DD` se não existir):
```
- HH:MM · <agente> · criou|atualizou|conflito|proposta|corrigiu · `caminho` · motivo curto
```

6. **Log da sessão em `Daily/logs/YYYY-MM-DD.md`** (ou `YYYY-MM-DD-<agente>.md` se outro
   agente já abriu o do dia). Template `Recursos/templates/L-template-daily-log.md`:
```yaml
---
title: "Daily log 2026-09-20"
tipo: daily-log
autor: ia
agente: "Claude (Claudian)"
atualizado: 2026-09-20
---
# Daily log — 2026-09-20
## Feito
## Decisões
## Abrir amanhã
## Propostas para Contratos
## Ligacoes
```
   `log.md` e `Daily/logs/` são os **únicos** append-only. Tudo o mais em Memoria é **editar,
   não empilhar**.

## 5. Construir memória de longo prazo — sobre ele e sobre os projetos

O objetivo não é arquivar sessões; é que, daqui a seis meses, qualquer agente saiba **quem é o
Flávio, como ele trabalha e onde cada projeto parou** sem perguntar de novo.

**Sobre o Flávio** (vai para proposta → Contratos, ou `Entidades/`):
- Como ele decide: critério que usou, o que descartou e por quê.
- O que ele rejeita: tom, formato, ferramenta, "isso não sou eu". Uma correção = uma proposta.
- Ritmo e restrições: horários, quando não incomodar, canal preferido para cada coisa.
- Pessoas em volta: papel, relação, contexto → `contacts/`.
- Metas e hábitos que ele verbalizou → `goals/`, `habits/`.
- **Frase curta e ambígua dele ("ainda não"): confirme antes de registrar como decisão.**
  Lição de 2026-09-19: "database ainda não" era "ainda não subiu", não "não mexe".

**Sobre cada projeto** (o índice humano do projeto é FUT do estado):
- Todo projeto tem uma nota-índice (`00-indice.md` ou `README.md`). Se o **estado** mudou e o
  projeto está no caminho da sua skill: atualize a nota (bump `atualizado`, tabela de estado,
  decisões com data). Se não está: registre em `Daily/logs/` e anote em §Abrir amanhã que o
  índice está defasado.
- **Decisão de desenho** com motivo → tabela "Decisões" do índice do projeto + `Daily/logs`.
  Se redefine rumo → `Entidades/goals/`.
- **Conceito que o projeto criou** e outro projeto pode usar → `Entidades/topics/` (ou wiki).
- **Armadilha técnica reutilizável** (ex.: "no Railway, `redeploy` não aplica config nova;
  precisa deploy fresco"; "Api e Worker do Dify devem estar na mesma imagem") → `Daily/logs` +
  linha no `log.md`; se repetir em outro contexto, promova para `topics/` ou proponha `Skills/`.
- **Estado, progresso, o que rodou** → só `Daily/logs/`. Não em Memoria.
- **Dado de cliente, PII, conteúdo de mensagem** → nunca. Link para a fonte.

**Sinais de que a memória está funcionando:** você abre uma sessão, lê `me.md` + fim do
`log.md` + índice do projeto, e não precisa perguntar nada que já foi respondido antes.

## 6. Propor mudança na core memory

Você **não edita** Contratos, AI Team nem Skills. Quando descobrir regra errada, padrão que se
repetiu, ou o Flávio disser "não faz X" / "isso não sou eu":

- Escreva em `Daily/logs/YYYY-MM-DD.md`, seção `## Propostas para Contratos`, com o **texto
  exato** que deveria entrar, o arquivo-alvo e o motivo.
- Linha em `Memoria/log.md` como `proposta`.
- O Second Brain lê no review e decide. Feedback do Flávio vira regra **no mesmo dia** — o que
  garante isso é a proposta escrita, não a sua memória de chat.

## 7. Checklist de encerramento (copiar e cumprir)

```
[ ] Reli a sessão: alguma correção/preferência do Flávio? → proposta escrita em Daily/logs §Propostas
[ ] Decisões com motivo → Daily/logs §Decisões (rumo duradouro → Entidades/goals/)
[ ] Pessoa nova → Entidades/contacts/ (buscar antes)
[ ] Conceito em 2+ contextos → Entidades/topics/ ou wiki/Teologo (buscar antes; template; proveniência; ≥2 links; _index)
[ ] Contradição → duas versões + conflito: true + log.md
[ ] Estado de projeto mudou → índice do projeto (se meu caminho) ou §Abrir amanhã
[ ] Uma linha por escrita em Memoria/log.md
[ ] Daily/logs/YYYY-MM-DD.md da sessão completo (autor: ia, agente:)
[ ] Nada em Daily/notes/, nada em Contratos/AI Team/Skills, nenhuma pasta nova na raiz
[ ] Nenhum PII / dado de cliente em Memoria/
```

## 8. Ferramentas

- **Obsidian CLI** (`obsidian search|read|create|links|backlinks`) — preferido para criar e ligar
  notas; exige o app aberto com o vault focado. Detalhes e armadilhas: skill `obsidian-cli` e
  `Memoria/Skills/obsidian-cli.md`. Não confundir com `ob` / `obsidian-sync` (Sync headless).
- **Shell**: `grep -ril`, `tail`, `cat`, heredoc para criar notas — funciona sem o app.
- **wacli**: leitura `wacli --read-only --json`; envio só o agente WhatsApp.
- Templates: `Recursos/templates/` — `T-` tarefa · `D-` decisão · `I-` insight · `A-` aprendizado ·
  `Q-` dúvida · `E-` entidade · `L-` daily log.

## 9. Armadilhas conhecidas

- `Projetos/imunizar/` = clone git com ~30k arquivos (518 MB). Ler `00-indice.md`/`README.md`;
  **não indexar, não varrer, não "organizar"**.
- `Home.md` não existe, mas `FUT.md` aponta para ele. Resolver pelo caminho real.
- O Sync às vezes recria `projetos/` minúsculo ao lado de `Projetos/`. Não apagar em loop; avisar.
- Pastas vazias leftover na raiz (`automacoes`, `cerebro`, `knowledge`): mencionar uma vez.
- README do `second-brain-pipeline` cita `/Users/flavio/` — usuário desta máquina é `box76`.
- `Memoria/Contratos/operacao.md` ainda cita `Recursos/knowledge/` para a wiki; ela foi movida
  para `Areas/Profissional/wiki/` em 2026-09-17 (proposta já registrada).
- Linked directory no Claudian não é ordem de ler tudo. Inspecione só o necessário.

## 10. Exemplo mínimo de sessão bem encerrada

```
1. li me.md, regras.md, memory.md, operacao.md; tail log.md; Daily/logs de hoje
2. trabalhei no caminho da minha skill
3. Flávio disse "não me chama de generalista" → NA HORA: proposta em Daily/logs §Propostas + log.md `proposta`
4. surgiu conceito "gate de coorte" pela 2ª vez → grep em Entidades → não existe → topics/gate-de-coorte.md
   pelo template, agente/fontes/confianca, 2 wikilinks, _index → log.md `criou`
5. estado do projeto mudou → 00-indice.md do projeto atualizado (é meu caminho) → log.md `atualizou`
6. checklist §7 → Daily/logs/YYYY-MM-DD.md completo → fim
```

## Captura automática — a memória pessoal que chega sozinha

O hook `memoria` do projeto (o dos princípios do claude-mem) observa cada turno. A observação que o Jev
marca como **pessoal** — sobre o Flávio, não sobre o código — nunca vai para o repositório: entra na
fila `~/.menosjuros/memoria-pessoal/`, com a categoria do protocolo, e o `scripts/drenar.mjs` desta
skill a grava no vault.

| Categoria | Onde entra | Por quê |
|---|---|---|
| `correcao` · `preferencia` | `Daily/logs/<dia>.md` → `## Propostas` | mudança de Contrato é proposta, nunca edição: quem decide é o Elrond |
| `decisao` | `Daily/logs/<dia>.md` → `## Decisões` | o recall episódico |
| `pessoa` · `meta` · `aprendizado` | `Daily/logs/<dia>.md` → `## Aprendizados` | promover a `Memoria/Entidades/` (template `E-*`) é decisão de quem revisa |

Cada gravação ganha uma linha no `Memoria/log.md`. O vault é `SECOND_BRAIN_PATH`, senão a VM, senão o
Mac. Drenar à mão: `node ~/.agents/skills/second-brain/scripts/drenar.mjs`. Sem vault, nada sai da fila.

## Recuperar a memória pessoal

Antes de decidir algo sobre o Flávio — como ele trabalha, o que ele já decidiu, quem é uma pessoa —,
procure, nesta ordem, e pare quando achar:

1. `Memoria/Contratos/me.md` e `padroes.md` — o que já é regra;
2. `Memoria/log.md` — as últimas ~30 linhas;
3. `Daily/logs/` dos últimos dias — `## Decisões`, `## Propostas`, `## Aprendizados`;
4. `Memoria/Entidades/` — busque pelo nome ou tema (`grep -ril "<termo>"`).

Cite o que achou com o caminho da nota. O que não achou, diga que não achou.
