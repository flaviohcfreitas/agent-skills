---
name: orbti-loop
description: Roda uma tarefa pelo ciclo inteiro — scout → reach → implement → monitoring —, com as voltas e o teto em código, parando só nas perguntas do reach, em fluxo crítico e no merge.
disable-model-invocation: true
---

# orbti-loop — o ciclo inteiro, de uma vez

**Ser chamada é a autorização para rodar o ciclo sem gate por passo.** O ciclo é o do `agent.md`, e
quem o executa é o workflow `orbti-loop.js`, nesta pasta: a ordem, as voltas e o teto são código, e
cada papel é o subagente pronto dele (`scout`, `reach`, `implement`, `monitoring`). Esta skill é a
sessão que conversa com o usuário — o workflow não fala com ele.

## Rodar

1. **A tarefa.** O texto que o usuário passou, ou o card do Multica que ele indicou (leia o corpo).
2. **O terreno.** `git status`: o implement escreve no branch atual. Com mudança alheia não commitada
   ou na `main`, diga isso e proponha um branch antes de seguir.
3. **Dispare** o workflow. Leia `orbti-loop.js`, nesta pasta, e passe o **conteúdo** em `script` — o
   Workflow só aceita `scriptPath` de dentro do projeto, e esta pasta fica fora dele:

   ```
   Workflow({ script: <o conteúdo de orbti-loop.js>, args: { tarefa, respostas: [] } })
   ```

   O resultado traz o `scriptPath` onde o Workflow guardou o script e o `runId`. As retomadas usam os dois.

4. **Leia o `estado` que ele devolve**, e siga a linha dele:

| `estado` | O que fazer |
|---|---|
| `perguntas` | Pergunte ao usuário (AskUserQuestion), cada pergunta com a recomendação do reach como primeira opção. Some as respostas em `respostas` e **retome**: `Workflow({ scriptPath: <o que o Workflow devolveu>, resumeFromRunId: <runId>, args: { tarefa, respostas } })` — os scouts voltam do cache |
| `critico` | Mostre a spec e o motivo. Com o ok do usuário, retome com `autorizar_critico: true` |
| `humano` | Pare. Mostre o motivo e o que ficou pronto; o usuário decide o próximo passo |
| `passou` | Entregue a **conferência** (abaixo) |

## A conferência

Quem chamou o loop não estava no meio dele. Entregue:

- **a tarefa**, como veio;
- **o que existe agora**: os arquivos que mudaram e a verificação que rodou;
- **como checar cada critério de pronto**, com a evidência que o monitoring deu;
- **o que o loop decidiu sozinho**: `decidido_sozinho` inteiro — suposições do reach e decisões do
  implement. É a parte que o usuário mais precisa ler;
- **quantas voltas** o monitoring pediu.

O loop **não commita, não abre PR e não mergeia.** Proponha o commit; PR e merge são do usuário. Com
card do Multica, comente a conferência nele.
