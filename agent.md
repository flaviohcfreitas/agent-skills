# agent.md — os papéis

Todo trabalho anda por **quatro papéis**, e **toda skill pertence a um deles**. Quem executa uma
skill é o subagente do papel dono dela, no momento do ciclo em que aquele papel entra. O papel decide
o harness e o modelo — a tabela é da skill `agent-models` de cada harness, e o melhor entre harnesses
é da `orchestri`. A skill decide o método.

```
demanda / issue
   │
   ▼
SCOUT ─────────► REACH ───────────────► IMPLEMENT ─────► MONITORING
busca e junta    decide:                constrói o       confere: testa e
o que o reach    entrevista, spec,      que o reach      verifica se foi
precisa          tickets, protótipo,    decidiu          feito o que deveria
                 mapa
   ▲                ▲                       ▲               │
   └── o reach      │                       └── refaz ──────┤  até 2 voltas; depois, humano
       pede         └──── lacuna de spec ───────────────────┘
```

## Cada papel alimenta o seguinte

**O scout busca e junta o que o reach precisa; o reach alimenta o implement com a decisão; o
implement alimenta o monitoring com o que construiu.** Nenhum papel começa do zero: começa do que o
anterior entregou, e cada passagem é um handoff — achados com endereço (`arquivo:linha`, comando,
link), spec ou tickets, diff com a verificação.

| Papel | Faz | Não faz |
|---|---|---|
| **scout** | busca e junta a informação: localiza, lê, inventaria, mede. Só leitura, barato, em paralelo | decidir, perguntar ao usuário, escrever |
| **reach** | decide: entrevista o usuário, escreve a spec, quebra em tickets, prototipa, traça o mapa | construir |
| **implement** | constrói o que o reach decidiu, com teste | decidir o caminho — lacuna volta ao reach |
| **monitoring** | confere o implement: testa, verifica, julga contra a spec. Outro modelo, acima do implement | consertar — quem conserta é o implement |

- **O grilling é do reach.** Quando a entrevista, a spec ou o diagnóstico precisam de um fato — onde
  o código mora, o que o log diz, o que já foi decidido —, o reach aciona um scout, recebe o achado e
  segue perguntando.
- **Todo papel delega a varredura ao scout**, e fica com o raciocínio.
- **Pular um papel só com o motivo escrito** no fechamento: o reach que já sabe os arquivos dispensa o
  scout; a tarefa que é só decisão termina no reach.

## De quem é cada skill

| Papel | Skills |
|---|---|
| **scout** | `research` |
| **reach** | `grilling` · `to-map` · `to-spec` · `to-tickets` · `to-questionnaire` · `prototype` · `diagnosing-bugs` · `domain-modeling` · `codebase-design` · `improve-codebase-architecture` |
| **implement** | `implement` · `tdd` · `impeccable` · `resolving-merge-conflicts` · `wizard` |
| **monitoring** | `code-review` · o juiz do `decision-gate` |
| **qualquer papel** | `handoff` · `multica` · `writing-for-agents` · `teach` · `wait-what` |

- **Uma skill, um dono.** Skill executada fora do dono é sinal de papel errado: devolva ao papel certo.
- **O projeto acrescenta as skills da casa** num `agent.md` na raiz dele; lá, a tabela do projeto manda.
- Skill nova entra nesta tabela no mesmo commit em que entra no repositório.

## Despachar pelo papel

**Cada situação despacha o subagente do papel, e ele já vem com o modelo e as skills definidos.**
Ninguém escolhe modelo na hora: a tarefa diz o papel, e o papel diz o resto.

| A tarefa precisa… | Despache | Que já vem com |
|---|---|---|
| buscar, achar, ler, inventariar | **scout** | o modelo barato, só leitura, a skill `research` |
| decidir, especificar, quebrar, prototipar, diagnosticar | **reach** | o modelo mais capaz e as skills de decisão |
| construir o que foi decidido | **implement** | o modelo que executa spec fechada, `implement` e `tdd` |
| conferir o que foi construído | **monitoring** | outro modelo, acima do implement, `code-review` e o juiz |

- **No Claude Code**, os quatro são subagentes prontos em `~/.claude/agents/` (`subagent_type:
  "scout"`, `"reach"`, `"implement"`, `"monitoring"`).
- **No Codex e no Cursor**, o subagente nasce com o modelo e o esforço que a skill `agent-models`
  daquele harness dá para o papel.
- **O reach não fala com o usuário**: quando precisa perguntar (o `grilling`), devolve as perguntas à
  sessão principal, cada uma com a recomendação, e a sessão pergunta.

## Os dois modos

| Modo | Como | O gate humano |
|---|---|---|
| **passo a passo** | o usuário chama cada papel — pela skill, ou descrevendo a tarefa | em cada passo: nada emenda sozinho |
| **`/orbti-loop`** (só Claude Code) | um comando roda o ciclo inteiro, com as voltas e o teto em código; tarefa com tema crítico (dinheiro, crédito, cadastro, auth) para e pede autorização antes de construir | a invocação autoriza o ciclo; ele **para** nas perguntas do `grilling`, que são do usuário, e no merge |

## O Jev nas passagens

O Jev (skill `decision-gate`) decide nas **passagens** entre papéis, onde a pergunta tem resposta
fechada: **qual papel e qual skill vêm a seguir** (`rotear.mjs`, um candidato por papel) e **o
veredito do monitoring** (`juiz.mjs --gate`: passou · refaz · humano). Ele não escreve e não
constrói: escolhe entre opções que o código monta, e o código aplica a regra.
