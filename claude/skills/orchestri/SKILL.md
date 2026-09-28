---
name: orchestri
description: Orquestra subagentes pelos quatro papéis — o Jev decide se a tarefa é grande (to-map com scouts dirigidos) ou pequena (scouts e grilling), depois reach (to-spec, to-tickets), implement com monitoring por ticket, e o Jev julga e abre o PR — num grafo de workflow dinâmico do Claude Code, em loop até a tarefa fechar. Cada papel roda no harness do modelo dele (Claude Code, Codex, Cursor, Grok); `--claude`, `--codex`, `--cursor` ou `--grok` restringem aos harnesses nomeados.
disable-model-invocation: true
---

# orchestri — o grafo dos quatro papéis

**Ser chamada é a autorização para rodar o grafo inteiro e sair do harness.** A ordem, as ondas, as voltas e o teto são código, no workflow `orchestri.js` desta pasta. Esta skill é a sessão que conversa com o usuário; o workflow não fala com ele.

```
      ┌─ grande ─► to-map ⇄ scouts dirigidos ───────────────────┐
Jev ──┤              │ sem névoa                                 ├─► to-spec ─► to-tickets ─┬─► implement ─► monitoring ─┐
      └─ pequena ─► scouts ─► grilling ── precisa de mapa? ─► to-map┘      ▲                   └─► implement ─► monitoring ─┴─► Jev
                                                                          └──────────── refaz do Jev · lacuna ───────────────────┘  │ passou
                                  ┌────────────────────────────────────────────────────────────────────────────────────────────────┘
                                  ▼
            toca tela? ── sim ─► adversarial (régua 4×20, zero defeito) ── defeito ─► tickets de correção ─► implement+monitoring ─► Jev ─┐
                │                      │ limpo                                  ▲                                                     │
                não                    ▼                                        └────────────── gauntlet: até bater a régua (teto 3) ─┘
                └────────────────────► PR  (merge humano)
```

- **O Jev abre o grafo:** pelo texto do pedido, decide **grande** (`to-map`, reach no Fable) ou **pequena** (`grilling`, reach no Opus). O código lê a decisão; o Jev não escreve.
- **Grande → to-map.** O mapa fica no grafo, **sem publicar** no tracker. Cada ticket `research` do mapa vira um **scout dirigido** — com a pergunta exata que uma decisão espera —, e o mapa roda de novo com os achados, até fechar (teto de 3). Tickets `grilling` viram perguntas ao usuário; `prototype` e `task` param em humano.
- **Pequena → scouts em ângulos fixos** (código, decisões, comportamento) **e o grilling**: o que precisa estar decidido antes da spec. As perguntas voltam ao usuário (`estado: perguntas`).
- **As perguntas viram um questionário** numa página do navegador (skill `grill-with-ui`, modo espera): todas as perguntas da rodada, com a recomendação, respondidas em qualquer ordem. **Enquanto você responde, os scouts da mesma rodada rodam** — perguntas e busca de fatos saem juntas. O grafo mostra o endereço da página e abre no navegador.
- **Confirmação antes da spec:** quando o grilling ou o mapa fecha, o grafo mostra o resumo e pergunta se o entendimento está certo. "Não" com a correção no texto refaz a rodada; só "sim" segue para o `to-spec`.
- **O grilling roda com a `domain-modeling`**, como o ticket grilling do `to-map` manda.
- **Tickets `prototype` do mapa viram um HTML para você avaliar**, feito pelo Opus 5.5 com a skill `prototype`:
  - **Tela** → abre no **modo live da `impeccable`**: você seleciona um elemento, comenta ou desenha em cima, pede variações e aceita uma, direto no HTML. O Opus 5.5 atende cada ação num nó `live:<ticket>`. O que você comentou e aceitou volta ao mapa como resposta.
  - **Lógica** → a máquina de estados com botões e roteiros, que aparece na página do questionário.
  - Tela no live e lógica no questionário rodam **ao mesmo tempo**, e os scouts seguem enquanto isso.
- **Tickets `task` param o grafo em humano** — decisão do Flávio, 27/09/2026: a task AFK também para.
- **As duas redes, em código:** o `to-map` que não acha névoa desce para o grilling, no Opus; o grilling que marca `precisa_mapa` sobe para o `to-map`, no Fable. Cada rede troca de caminho uma vez só.
- **to-spec, depois to-tickets:** o reach fecha a spec da tarefa inteira e a quebra em **tickets**, cada um com arquivos exclusivos, critério de pronto e dependências. Os tickets ficam no grafo, sem publicar no tracker.
- **Um implement por ticket**, em ondas: o código monta as ondas pela dependência, e ticket que disputa arquivo vai para a onda seguinte.
- **Cada implement tem o seu monitoring.** Refaz volta ao implement do ticket, até 2 voltas.
- **O Jev julga o todo** — o juiz da skill `decision-gate`, não outro modelo. Uma ponte barata monta a spec, o diff completo (com os arquivos novos) e a saída da verificação, roda `juiz.mjs --gate` e devolve o **exit code**; o veredito sai dele, em código. `passou` fecha. `refaz` volta ao `to-spec` — o Jev não lista o que falta, então o reach relê a spec, o entregue e a verificação, e especifica só o que falta, sem repetir o grilling ou o mapa. `humano` para. Exit `1` (sem chave, API fora) para em humano dizendo que **o trabalho não foi julgado**. Tema crítico vai com `--critico`.
- **Lacuna de um implement** também volta ao `to-spec`.

## Os papéis e os modelos

| Papel | Faz | Não faz | Todos os harnesses | `--claude` | `--codex` | `--cursor` |
| --- | --- | --- | --- | --- | --- | --- |
| **scout** | busca e junta: localiza, lê, inventaria. Só leitura | decidir, escrever | GPT-6 Luna `medium` | Haiku 4.5 | GPT-6 Luna | Composer 2.5 |
| **reach** | decide: spec, tickets, perguntas | construir | Opus 5.5; Fable 5.1 na escalada | Opus 5.5 · Fable | GPT-6 Astra | Grok 4.7 |
| **implement** | constrói o ticket, com teste | decidir o caminho | Grok 4.7 **no Cursor** (`cursor-agent --model grok-4.7-high`) | Sonnet 5 | GPT-6 Luna `xhigh` | Composer 2.5 |
| **monitoring** | confere pelo diff e pela verificação | consertar | GPT-6 Sol `max` | Opus 5.5 | GPT-6 Sol `max` | Grok 4.7 |

**Luna faz o trabalho pesado, Opus e Fable planejam, Grok executa, GPT monitora.**

**Se o Grok não puder implementar, o GPT-6 Sol implementa e o Fable 5.1 confere** — o par muda inteiro, porque o monitoring nunca é do provedor do implement. Vale nos dois casos: o Grok não está (nem no Cursor nem pela CLI própria), ou falha na hora (erro, cota) — aí o ticket troca para esse par (`plano.reserva`) e refaz a volta sem contar como refaz. O par exige o Claude permitido: no `--codex`, Luna constrói e Sol confere. **Implement só entra com quem o confira:** no `--cursor`, o Grok não constrói, porque só ele conferiria — Composer constrói, Grok 4.7 confere.

**O monitoring de cada ticket roda a skill `code-review`**, nos dois eixos (Standards e Spec). Achado que bloqueia vence o veredito, em código: `passou` com bloqueio vira `refaz`. `--grok` não fecha os quatro papéis sozinho: vale somado a outro harness (`--grok --claude`). Quem decide a tabela em execução é o `harnesses.mjs`, com teste ao lado: esta tabela e a `PREFERENCIA` dele mudam juntas.

- **Pague inteligência no reach e no monitoring, não no scout.**
- **O monitoring é de outro provedor que o implement**, quando há outro permitido. Com um provedor só, é outro modelo, acima do implement — e o plano avisa.
- **Implement com ticket incompleto devolve a lacuna**: decidir é do reach.
- **Fable é escalada, não atalho:** o reach sobe para ele quando a tarefa é grande (a porta do Jev, ou o grilling que pede mapa).
- **Regra do projeto** (piso de modelo, fluxo crítico) vence esta tabela.
- **Fora do grafo**, para delegar um papel só dentro do Claude Code, use os subagentes prontos em `~/.claude/agents/` (`scout`, `reach`, `implement`, `monitoring`): cada um já vem com o modelo da coluna `--claude`.

## Rodar

**O grafo inteiro roda dentro do workflow**, da detecção dos harnesses ao PR, para a zoe e o `/workflows` mostrarem cada nó: `harnesses` → `jev:porta` → mapa ou grilling → questionário → spec → tickets → implements e monitorings → `jev` → `pr`.

1. **O terreno.** `git status`: os implements escrevem no branch atual. Com mudança alheia não commitada, diga isso antes de seguir — o PR só leva os arquivos dos tickets, mas o working tree é compartilhado.
2. **Dispare.** Copie `orchestri.js` para o scratchpad da sessão e passe esse caminho em `scriptPath` — o Workflow só aceita `scriptPath` de um diretório que a sessão já lê, e colar os 43 KB em `script` custa o dobro. `repo` roda o grafo em outro repositório (todo nó trabalha nele). `flags` são as do usuário (`claude`, `codex`, `cursor`, `grok`; vazio = todos os instalados):

   ```
   Workflow({ script: <conteúdo de orchestri.js>, args: { tarefa, flags: [], respostas: [] } })
   ```

   O resultado traz o `scriptPath` e o `runId`; as retomadas usam os dois. Diga ao usuário que ele acompanha o grafo pela zoe (`zoe <id da sessão>`, ou o plugin no Herdr) e pelo `/workflows`.
3. **Os nós que antes eram passos da sessão:**
   - **`harnesses`** roda `harnesses.mjs` com as flags. Exit `1` (harness pedido e não instalado, ou papel sem harness) volta como `humano`, com o motivo.
   - **`jev:porta`** roda o roteador do Jev com dois candidatos, `pequena` e `grande`. **Classificador, não porteiro:** vale a maior probabilidade ≥ 0,60; abaixo disso, ou sem chave, vai de `grande` — o `to-map` sem névoa desce sozinho.
   - **`pr`** roda só depois do `passou` do Jev (abaixo).
4. **Leia o `estado`** e siga a linha dele:

| `estado` | O que fazer |
| --- | --- |
| `perguntas` | **Só quando o questionário falhou**: a página não abriu, ou ficou 45 min sem resposta. Vêm do `grilling`, do `to-map` ou do `to-spec` (o campo `rota` diz qual). Pergunte ao usuário (AskUserQuestion), com a recomendação do reach como primeira opção. Some as respostas em `respostas`, cada uma como `{ pergunta, resposta, rota }` — resposta com `rota: "to-spec"` não reabre o grilling nem o mapa e **retome**: `Workflow({ scriptPath, resumeFromRunId: runId, args: { tarefa, flags, respostas } })` — os nós anteriores voltam do cache |
| `critico` | Mostre a spec e o motivo. Com o ok do usuário, retome com `autorizar_critico: true` |
| `humano` | Pare. Mostre o motivo, os tickets `entregues` e o que ficou aberto; o usuário decide |
| `passou` | O Jev passou e o nó `pr` abriu o PR: entregue a **conferência** com o link (`pr.url`), ou o comando em `pr.erro` quando o PR não abriu |

## O gauntlet visual — o protótipo de tela contra uma referência real

O truque central do gauntlet: a régua é uma **referência real**, não um critério.

1. Enquanto o Opus constrói o HTML, o reach propõe **2 ou 3 referências**, cada uma **nomeada** (uma coisa específica, não uma categoria), **abrível** (URL pública ou rota local já servida) e **comparável** (dá para pôr lado a lado). A mais difícil que dá para alcançar vem primeiro.
2. Você escolhe no mesmo questionário da rodada, e o modo live roda junto.
3. Depois do live (o HTML já tem o que você aceitou), um nó tira os **dois prints no mesmo tamanho** com nomes neutros, **A e B, que trocam de lado a cada volta em código**.
4. Um **crítico duro** (Fable, contexto novo) vê só as duas imagens e escolhe a melhor. Ele nunca sabe qual é a nossa.
5. Perdemos: o Opus melhora o protótipo com o que o crítico apontou, sem copiar a referência, e compara de novo. **Teto de 3 voltas.**
6. O resultado ("venceu X às cegas na volta N", "não venceu; falta…" ou "não comparado") volta ao mapa como resposta.

## O gauntlet adversarial — antes do PR

Quando algum ticket toca tela (o código decide pelos arquivos: `.tsx`, `.jsx`, `.vue`, `.html`, `.css`, `pages/`, `components/`, `client/`…), o grafo roda o **`npm run adversarial`** do projeto: N navegadores tentando quebrar a tela, o Jev escolhendo cada clique, e o código registrando console, exceção, 5xx, toast de erro e tela em branco. É o **crítico duro e cego** do conceito gauntlet: ataca a tela sem ver o diff.

- **A régua é fixada antes:** 4 sessões × 20 passos, zero defeito (`REGUA` no workflow).
- **Defeito vira ticket de correção:** o reach transforma cada defeito (com o caminho de cliques) em ticket; implement e monitoring corrigem; o Jev julga de novo; o adversarial ataca de novo.
- **Loop até bater a régua**, com teto de 3 voltas; depois, humano, com o relatório.
- O veredito sai do exit code do adversarial (0 limpo · 2 defeitos · 1 erro/infra). Projeto sem o script: o PR segue e a conferência diz isso.
- A skill `gauntlet-loop` saiu em 27/09/2026: o conceito dela (régua antes, crítico separado, voltar até ganhar) vive aqui.

## O questionário

Dois nós por rodada: um abre a sessão do `grill-with-ui` (`new`, um `patch` com todas as perguntas, `serve` destacado, `url`, `open`); outro espera no modo espera (`wait` em laços de até 8 min, porque o Bash tem teto de 10 min), aplica cada envio e para quando tudo está respondido ou adiado. As respostas entram em `respostas` com a `rota` de origem e seguem no grafo. **O nó que espera morre com a sessão**: fechar o terminal no meio perde a rodada, e a retomada volta a perguntar.

## O modo live

Provado num subagente de workflow em 27/09/2026. O nó `live:<ticket>` faz o boot da `impeccable` (`live --target` no HTML), serve a página por http numa porta livre, abre no navegador e fica no `live-poll` em primeiro plano, atendendo `generate`, `steer`, `accept`, `discard` e os outros eventos, até o `exit` ou 45 min. No fim, roda o Cleanup e para o servidor.

- **Protótipo de tela fica numa pasta própria** (`$TMPDIR/orchestri-prototipo-<ticket>/`). O live exige `PRODUCT.md` e `DESIGN.md`: fora do repositório, o nó escreve os dois mínimos ao lado do HTML; dentro do repositório, nunca cria — usa o `--target` na app que já tem os dois.
- **O `accept` está provado** (27/09/2026): a variação aceita foi gravada no HTML (a limpeza "carbonize" da Impeccable). Para selecionar, o usuário usa **Pick** (Insert põe bloco novo; Steer é conversa).
- **O nó que espera sempre devolve o contrato**, mesmo no tempo esgotado (`parcial=true`): sem isso, o workflow refaz o nó do zero, a nova tentativa espera uma página que ninguém abre, e o relatório final sai errado — aconteceu no teste.
- **Sessão velha da Impeccable** deixa aviso na página: o nó fecha as `activeSessions` com `live-complete` antes do boot.
- **O helper da `impeccable` pode inserir no lugar errado** quando há várias caixas iguais (escolheu o primeiro `div.box`): o nó confere a âncora e corrige.

## O que o primeiro teste real ensinou (27/09/2026)

Tarefa pequena num repositório descartável, todos os harnesses. O grafo fechou em `passou`, e o teste achou cinco defeitos, todos corrigidos:

- **Modelo não redigita JSON grande:** o nó `harnesses` devolveu o plano sem uma chave. O plano agora é código (bloco `<plano>`, copiado de `harnesses.mjs` por `sincronizar.mjs`, conferido por teste); o nó devolve só a lista curta.
- **A ponte fez o trabalho no lugar do Grok** depois que a permissão bloqueou o CLI — e o grafo registrou "grok" como quem construiu. Agora a ponte devolve a **prova de execução** (comando, exit, fim da saída); sem prova, é falha do harness: reserva ou humano.
- **O reach trocou o harness** ("construa direto, sem agente externo"). Harness e modelo são do plano; falha de runner não é lacuna de spec.
- **`to-map`, `to-spec` e `to-tickets` são `disable-model-invocation`:** o reach segue o método lendo o `SKILL.md` delas.
- **O ID `grok-4.7` não existe no Cursor**: é `grok-4.7-high` (e um teste confere a lista).

**Requisito de permissão:** CLI externo que **escreve** (implement) ou tem **rede** (monitoring) é bloqueado pela permissão de "agentes inseguros" da sessão. Sem liberar `cursor-agent`, `codex exec` e `grok` para os subagentes, esses nós falham com prova — e o grafo para em humano, dizendo por quê, em vez de mentir.

## Como um papel externo roda

No harness `claude`, o papel é um subagente nativo, com o modelo do plano. Nos outros, o workflow despacha uma **ponte**: um subagente Haiku grava o briefing num arquivo temporário, roda o comando sem tela que o `harnesses.mjs` montou (`codex exec`, `grok --prompt-file`, `cursor-agent -p`) e só transcreve a saída no contrato do papel. A ponte não opina nem refaz o trabalho; comando que falhou vira motivo, nunca resultado inventado. Comando longo roda em background, porque o Bash tem teto de 10 min por chamada. **Scout e reach externos só leem** (`read-only` no Codex, `--mode ask` no Cursor). **O implement escreve.** **O monitoring roda a verificação e o juiz**, então tem shell, tmp e rede (no Codex, `workspace-write` com rede); que ele não conserta é regra do prompt dele, não do sandbox.

## A conferência

Quem chamou não estava no meio do grafo. Entregue:

- **a tarefa**, como veio, e o **modo** (quais harnesses) com os avisos do plano;
- **cada frente**: papel, harness, modelo — o campo `frentes`;
- **os tickets entregues**: arquivos e verificação de cada um;
- **o veredito do Jev**: `jev.veredito`, a confiança e a linha dele, e a verificação que rodou;
- **como checar cada critério de pronto da tarefa**, com a evidência dos monitorings de cada ticket;
- **o que o grafo decidiu sozinho**: `decidido_sozinho` inteiro — suposições do reach e decisões dos implements. É a parte que o usuário mais precisa ler;
- **quantas rodadas** foram necessárias.

## Passou pelo Jev: o nó `pr`

**Só depois do `passou` do Jev**; qualquer outro estado não abre PR. O nó segue estes passos:

1. **O branch.** Na `main` (ou no branch padrão), crie `orchestri/<slug-da-tarefa>`. Num branch de trabalho, use ele.
2. **O commit leva só `arquivos`** — a lista que o grafo devolve, dos tickets entregues. `git add` arquivo por arquivo, nunca `git add -A`; confira com `git diff --cached --stat` que nada alheio entrou. Mudança alheia no working tree fica onde está.
3. **A mensagem**: `feat|fix(<escopo>): <a tarefa>`, com os tickets no corpo e as linhas de atribuição da sessão.
4. **Push e PR**: `git push -u origin <branch>` e `gh pr create --base <branch padrão>`. O corpo leva a tarefa, os critérios de pronto, os tickets, o veredito do Jev (confiança e linha), a verificação que rodou, `decidido_sozinho` inteiro e as frentes (papel, harness, modelo) — é a conferência abaixo, no PR.
5. **O que ficou de fora é avisado, nunca apagado:** depois do commit, `git status --short` lista o que não entrou (não rastreado ou alheio, como o cache `graft/.cache` que os ganchos do graft gravam onde um subagente trabalha). A lista vai em `pr.fora` e numa seção "Fora deste PR" no corpo.
6. **O merge é do usuário, sempre.** Não mergeie, não ative auto-merge, não aprove.
7. **Com card do Multica**: comente o link do PR no card e mova para `in_review`.

Sem `gh` autenticado ou sem remoto: faça o commit, diga que o PR não abriu e por quê, e mostre o comando para o usuário rodar.
