---
name: multica
description: O board do Multica pela CLI — sub-issue com a ORDEM DE EXECUÇÃO em `--stage`, propor vs disparar outro agente, e o próprio card com `--no-start`. Use ao criar tickets no Multica, ao perguntar "qual executo primeiro?", ao despachar agente, ou ao mover o card.
---

# Multica — ordem, disparo e o card honesto

O Multica é onde o humano dá a ordem de construir: **mover a coluna É a autorização**. Tudo abaixo
existe para você propor sem ordenar, e para a ordem de execução ficar **escrita no card**, nunca na
sua cabeça.

## 1. A ordem de execução é o `--stage`, e ele é BARREIRA

`--stage N` agrupa as sub-issues de um pai em **ondas ordenadas**. Onda 1 roda primeiro; a onda 2 só
faz sentido depois que a onda 1 inteira fechou; o pai só acorda quando a última onda fecha.

- **Mesma onda = pode rodar em paralelo.** Duas fatias que não dependem uma da outra ficam no mesmo stage.
- **Uma depende da outra = stages diferentes.** Dependência é stage, **nunca** comentário ou ordem de criação.
- **Prioridade NÃO é ordem.** `--priority high` diz o quanto o item merece atenção **dentro da onda**. Onda 1 `medium` roda antes de onda 2 `high`.
- **Ticket de MEDIDA (`Research`) entra na onda em que a resposta é necessária**, não na primeira por reflexo.
- **A dependência vai ESCRITA na descrição, primeira linha:** `Depende de: MJ-19 [S1]` — a lista do board não mostra stage, e quem abre o card tem que ver de quem ele depende sem sair dele. Onda 1 não escreve nada.

**O guarda de quem executa:** o stage não impede um humano de mover um card da onda 2 antes da hora. Por isso, **antes de começar qualquer sub-issue com stage ≥ 2**, rode `multica issue children <pai>`; se algum card da onda anterior não está em `done` ou `cancelled`, **NÃO comece**: comente "bloqueado por <keys>, onda <n-1> aberta" e ponha o seu card de volta em `backlog --no-start`.

**Deixe a onda visível no título**, porque a lista do board não mostra a coluna `stage`: o título
começa com `[S<n>]` — `[S1] Gate 3b em modo SOMBRA…`. É cache de um campo que o board esconde, e por
isso paga.

Para LER a ordem de um pai, uma linha basta:

```bash
multica issue children <pai>        # sub-issues agrupadas por stage, com status e dono
```

Onda errada se corrige sem acordar ninguém:

```bash
multica issue update <id> --stage 2 --no-start
```

## 2. Criar sub-issue: propor, não disparar

`issue create` **nunca inicia run**, mesmo com `--assignee`. É o modo PROPOR — o card nasce parado,
esperando o humano mover a coluna.

```bash
multica issue create --title "[S2] MEDIR: <a pergunta>" --parent <pai> --stage 2 \
  --priority medium --assignee Research --description-stdin <<'EOF'
<o que você quer DE VOLTA, e que resultado escolhe qual caminho>
EOF
```

**O título diz o que você quer de volta**, não o que o outro deve fazer. `MEDIR: a regra dá para
inferir por cliente?` cobra resposta; `investigar open finance` não cobra nada.

Sub-issue de **construção** (`Implement`, `Unit-test`, `E2e-test`) você **só cria**: quem dispara é o
humano. Sub-issue de **medida** (`Research`) você pode disparar sozinho dentro de um esforço já autorizado.

## 3. Disparar, quando é seu papel disparar

Dois comandos acordam um agente. Use-os só para medida, ou quando o humano já autorizou a fatia:

```bash
multica issue assign <key> --to Research      # INICIA o run na hora
multica issue status <key> in_progress        # TAMBÉM inicia — é assim que o humano manda construir
```

## 4. O seu próprio card, sempre com `--no-start`

`--no-start` muda o quadro sem acordar ninguém. É o **relato**; sem ele, é **ordem**.

```bash
multica issue status <sua-issue> in_progress --no-start   # comecei
multica issue status <sua-issue> in_review   --no-start   # terminei, precisa de leitura
multica issue comment add <sua-issue> --body-stdin        # o resultado, com endereço
```

⛔ Você **nunca** move para `done` nem `cancelled` — `done` é do humano, depois do merge. A única exceção é a **ordem de serviço** do §5. E **nunca**
move o card de outro agente. Board que não reflete o trabalho é board que ninguém olha: em 17/09/2026
uma sub-issue ficou em `backlog` com agente trabalhando nela.

## 5. Ordem de serviço — a tarefa era quebrar em tickets, e foi feita

O card que o humano atribui ao `To-tickets` ou ao `To-map` é uma **ordem de serviço**: "quebrar em tarefas",
"mapear isto". A tarefa dela é **fazer os tickets existirem**. Existindo, a tarefa acabou e o card vai a `done`.
Ela **não vira pai de nada**: os tickets nascem **no nível do projeto**, e os níveis do trabalho começam neles.

**Três regras, e elas fecham o desenho:**

1. **Ticket solto no projeto é INDEPENDENTE, e mesmo assim leva `[S<n>]` no título.** Independente quer dizer que nada o
   bloqueia; a onda diz **em que ordem atacar**. `[S1]` no projeto é o que vale começar primeiro.
2. **Dependência vira SUBTICKET.** Se B só roda depois de A, os dois são partes de algo maior: esse algo é o ticket
   no projeto, e A e B são subtickets dele, com `--stage 1` e `--stage 2`. A dependência é **sempre** `--stage` entre
   irmãos — nunca texto entre tickets soltos.
3. **Três níveis, e para.** Ticket → subticket → medida.

```
projeto
├── [S1] ticket A          ← ordem de ataque; nada o bloqueia
├── [S1] ticket B
│   ├── [S1] subticket     ← parte de B; --stage 1
│   └── [S2] subticket     ← --stage 2: só depois da onda 1 fechar — "Depende de: <S1>"
│       └── MEDIR: …       ← medida que só serve a esse subticket
└── [S2] ticket C          ← ataque depois de A e B
```

**`[S<n>]` em todo ticket, em todo nível.** No projeto ele é ordem de ataque, sem barreira. Embaixo de um pai ele
espelha o `--stage`, que é barreira.

O que o agente faz, nesta ordem:

1. Lê o projeto da ordem de serviço: `multica issue get <ordem> --output json` → `project_id`.
2. Cria **cada ticket independente** no nível do projeto: `--project <project_id>`, **sem `--parent`**, com `[S<n>]` no
   título dizendo a ordem de ataque.
3. O que depende de outra coisa **não** nasce solto: nasce como subticket do ticket que os contém, com `--parent`,
   `--stage`, `[S<n>]` no título e "Depende de" na primeira linha a partir da onda 2 (§1).
4. Comenta na ordem de serviço a lista dos tickets criados, e `multica issue children <ticket>` de cada um que tem partes.
5. Fecha a ordem de serviço: `multica issue status <ordem> done --no-start`.

**Esta é a ÚNICA exceção ao "agente nunca move para `done`".** Ordem de serviço não tem merge a esperar: o entregável
dela são os tickets, e a lista está no comentário. Todo outro card do agente continua parando em `in_review`.

## 6. Antes de começar: a lente do card

```bash
multica issue property list <id>    # Trilha (eng · design · product) e Classe
```

Trilha ausente? Pergunte no comentário em vez de escolher.

## Completion

Sub-issues criadas **todas** com `--parent`, `--stage` e `[S<n>]` no título · `multica issue children <pai>`
mostra a ordem que você quis · o seu card está na coluna que reflete o trabalho, movido com `--no-start`.
