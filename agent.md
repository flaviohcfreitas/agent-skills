# agent.md — os agentes

Todo trabalho anda por **quatro agentes**, que são os **nós de um grafo**. **Cada skill desenha o caminho
dela** nesse grafo: que agente entra primeiro, qual vem depois, e em que condição. O **ciclo inteiro**
(scout → reach → implement → monitoring, com as voltas) é um desses caminhos, o mais longo.
A skill decide o método e o caminho. O harness e o modelo de cada papel estão num arquivo só,
`~/.agents/papeis/harnesses.mjs`, e os quatro agentes o leem em qualquer harness.

```
  SCOUT ───achados───► REACH ───decidido───► IMPLEMENT
    │  ◄─precisa de fato─┘  ▲  ◄────lacuna─────┘    │
    │                       │ desalinhado           │ construiu
    └───achados──────► MONITORING ◄─────────────────┘
                         │   └──refaz (até 2 voltas)──► IMPLEMENT
                         ▼
                alinhado: fim · 3ª volta: humano
```

## Os nós

| Agente | Faz | Não faz |
|---|---|---|
| **scout** | busca e junta a informação: localiza, lê, inventaria, mede. Só leitura, barato, em paralelo | decidir, perguntar ao usuário, escrever |
| **reach** | o agente mais capaz: **consolida a informação e constrói uma visão clara** — a spec, o diagnóstico, o mapa, os tickets, o protótipo, a entrevista com o usuário | construir |
| **implement** | constrói o que o reach decidiu, com teste | decidir o caminho — lacuna volta ao reach |
| **monitoring** | **confere o que existe contra o que deveria existir**: o comportamento de hoje, ou o que o implement construiu. Testa, verifica, julga contra a spec. Outro modelo, acima do implement | consertar — quem conserta é o implement |

- **Todo agente delega a varredura ao scout**, e fica com o raciocínio.
- **O grilling é do reach.** Quando a entrevista, a spec ou o diagnóstico precisam de um fato, o reach
  aciona um scout, recebe o achado e segue perguntando.

## As arestas

Cada aresta é um handoff, com o que passa por ela. Nenhum agente começa do zero.

| De → para | Quando | O que passa |
|---|---|---|
| scout → reach | o reach precisa de fatos para decidir | achados com endereço (`arquivo:linha`, comando, link) |
| scout → monitoring | é preciso julgar o que existe | os achados: log, erro, gravação, código |
| reach → scout | falta um fato para seguir | a pergunta exata |
| reach → implement | o caminho está decidido | a spec ou os tickets |
| implement → reach | a spec tem lacuna | a lacuna, com o que falta decidir |
| implement → monitoring | construiu | o diff, com a verificação |
| monitoring → implement | **refaz**: o construído não cumpre a spec | o que falhou. Até 2 voltas; na 3ª, humano |
| monitoring → reach | **desalinhado**: o que existe difere do que deveria, e ninguém sabe a causa | o desalinhamento, com a evidência |
| monitoring → fim | alinhado, ou `passou` | o veredito |

## A primeira decisão: qual caminho

**Quando chega uma tarefa, a primeira decisão da sessão principal é o caminho no grafo: quais agentes,
em que ordem, e em que condição.** A tarefa nunca entra num agente sem essa decisão, e ela aparece na
primeira linha da resposta ("vou chamar o scout para achar X"), para o usuário corrigir antes de rodar.

- **Skill chamada pelo nome** (`/diagnosing-bugs`, `/to-spec`): o caminho vem da tabela da seção
  seguinte. Ninguém adivinha.
- **Texto livre**: um de cinco caminhos. **O ciclo inteiro é o teto, não o piso**: a tarefa entra pelo
  agente que ela pede e só segue uma aresta se precisar dela.

| A tarefa | O caminho |
|---|---|
| achar, ler, inventariar, medir | só o **scout** |
| ter uma visão: decidir, especificar, quebrar, prototipar, diagnosticar | o **reach** (→ scout, se faltar um fato) |
| construir o que já está decidido | o **laço de refaz** |
| conferir o que existe ou o que foi construído | o **monitoring** |
| **complexa** — o caminho ainda não está decidido **e** a tarefa pede construção | o **ciclo inteiro**: **leque** → reach → **ondas** |

- **Complexa tem critério, não gosto:** caminho em aberto **e** construção. "Corrige o cálculo da taxa,
  que está errado" (sem saber onde nem como) é ciclo; "troca 0,16 por 0,17 na taxa do Bradesco" é
  implement → monitoring.
- **Na dúvida entre um caminho curto e o ciclo, é o ciclo**, dito em voz alta: errar para menos custa mais.
- **Construção sempre termina no monitoring.** Quem construiu não julga.

## Os padrões

Caminhos que se repetem ganham **nome**, como os padrões de um dynamic workflow. A skill cita o padrão em
vez de soletrar o caminho. Três têm ordem e teto que o modelo não pode pular, e por isso são **código**:
workflows em `~/.claude/workflows/` (spec em `specs/padroes-de-grafo.md`). Os outros cinco são texto,
e a sessão os segue.

| Padrão | O grafo | Onde vive |
|---|---|---|
| **leque** | N scouts em paralelo, cada um num ângulo → 1 reach consolida | texto |
| **até secar** | rodadas de scouts até 2 rodadas seguidas sem achado novo → reach | texto |
| **névoa** | reach traça o mapa ⇄ scouts dirigidos pela pergunta exata, até a névoa fechar | texto |
| **diagnóstico** | scout → monitoring diz o que está desalinhado com o que deveria → *(desalinhado)* reach monta a causa | texto |
| **painel** | N reach com ângulos diferentes → monitoring escolhe → reach junta o melhor | texto |
| **laço de refaz** | implement ⇄ monitoring, com o Jev no veredito; até 2 voltas, na 3ª humano | workflow `laco-de-refaz` |
| **ondas** | tickets → um implement por ticket, em ondas pela dependência, cada um no seu **laço de refaz** → fechamento obrigatório | workflow `ondas` |
| **adversarial** | N monitoring tentam refutar o mesmo achado, cada um com uma lente → a maioria decide | workflow `adversarial` |

- **O ciclo inteiro é uma composição:** **leque** → reach (spec e tickets) → **ondas**. Não há workflow
  dele: a sessão compõe.
- **Fluxo crítico** (dinheiro, crédito, cadastro, auth) para os três workflows antes de rodar o primeiro
  agente, até o usuário autorizar; autorizado, o fim nunca é `passou` sozinho.
- **Nenhum padrão faz commit nem abre PR.** Quem abre é a sessão.

## O caminho de cada skill

A skill não pertence a um agente: **ela desenha o caminho dela no grafo**, e o caminho pode ter condição.
`(condição)` marca a aresta que só se segue quando a condição vale.

| Skill | O caminho |
|---|---|
| `research` | **leque**, sem o reach no fim quando só se pede o achado; **até secar** quando o tamanho é desconhecido |
| `grilling` · `to-questionnaire` | **reach** monta as perguntas, com recomendação → *(falta um fato)* **scout** → **reach**. As perguntas voltam à sessão, que pergunta ao usuário |
| `to-map` | **névoa** |
| `to-spec` · `to-tickets` | **reach** → *(falta um fato)* **scout** → **reach** |
| `prototype` | **reach** fecha a pergunta e constrói o protótipo descartável (não passa pelo monitoring) |
| `diagnosing-bugs` | **diagnóstico** (o scout junta log, erro, gravação e código) → *(o usuário pede a correção)* **laço de refaz** |
| `domain-modeling` · `codebase-design` | **leque** (os scouts levantam o código; o reach constrói a visão) |
| `improve-codebase-architecture` | **leque** → *(decisão difícil)* **painel** |
| `implement` · `tdd` | **laço de refaz**; com tickets, **ondas** |
| `impeccable` | **laço de refaz**, com o monitoring no modo de auditoria dela |
| `resolving-merge-conflicts` | **laço de refaz** |
| `wizard` | **implement** gera o roteiro; quem executa os passos é o humano |
| `code-review` | **monitoring** (os dois eixos em paralelo); fluxo crítico, **adversarial** → *(o usuário pede a correção)* **laço de refaz** |
| `decision-gate` | decide arestas: o juiz na saída do **monitoring**; o roteador, na sessão, entre um agente e o seguinte |
| `handoff` · `multica` · `writing-for-agents` · `teach` · `wait-what` | a própria sessão, ou qualquer agente que precise |

- **O projeto acrescenta as skills da casa** num `agent.md` na raiz dele; lá, a tabela do projeto manda.
- Skill nova entra nesta tabela no mesmo commit em que entra no repositório.

## Despachar pelo papel

**Cada situação despacha o subagente do papel, e ele já vem com o modelo e as skills definidos.**
Ninguém escolhe modelo na hora: a tarefa diz o papel, e o papel diz o resto.

| A tarefa precisa… | Despache | Que já vem com |
|---|---|---|
| buscar, achar, ler, inventariar | **scout** | o harness e o modelo de `harnesses.mjs`, só leitura, a skill `research` |
| consolidar e construir a visão: decidir, especificar, quebrar, prototipar, diagnosticar | **reach** | o harness e o modelo de `harnesses.mjs` · já carrega `grill-with-docs`, `prototype` e `research` |
| construir o que foi decidido | **implement** | o harness e o modelo de `harnesses.mjs`, `implement` e `tdd` |
| conferir o que existe ou o que foi construído | **monitoring** | o harness e o modelo de `harnesses.mjs` (outro modelo que o implement), `code-review` e o juiz |

- **Todo agente roda `node ~/.agents/papeis/harnesses.mjs resolver <papel> --aqui <harness>` antes de
  trabalhar.** No Claude Code os quatro são subagentes prontos em `~/.claude/agents/` (`subagent_type:
  "scout"`, `"reach"`, `"implement"`, `"monitoring"`); no Codex e no Cursor, o subagente nasce no harness
  da sessão. O padrão roda onde o agente já está → ele faz o trabalho. O padrão é outro harness → o agente é
  a **ponte**: `rodar` chama a CLI daquele harness e devolve o resultado com a prova da execução.
- **Fallback:** ausente, fora de `PAPEIS_SO` (ex.: `PAPEIS_SO=claude,codex`), sem par de conferência ou
  falhou na hora → o próximo candidato da tabela, **dito em voz alta** na primeira linha da volta e repetido
  pela sessão ao usuário. Todo papel tem um candidato Claude.
- **O reach não fala com o usuário**: quando precisa perguntar (o `grilling`), devolve as perguntas à
  sessão principal, cada uma com a recomendação, e a sessão pergunta.

## O modo

| Modo | Como | O gate humano |
|---|---|---|
| **passo a passo** | o usuário chama uma skill, ou descreve a tarefa, e a sessão percorre o caminho dela no grafo | em cada aresta que leva à construção: nada emenda sozinho |

## O Jev nas arestas

O Jev (skill `decision-gate`) decide nas **arestas** entre agentes, onde a pergunta tem resposta
fechada: **qual papel e qual skill vêm a seguir** (`rotear.mjs`, um candidato por papel) e **o
veredito do monitoring** (`juiz.mjs --gate`: passou · refaz · humano). Ele não escreve e não
constrói: escolhe entre opções que o código monta, e o código aplica a regra.
