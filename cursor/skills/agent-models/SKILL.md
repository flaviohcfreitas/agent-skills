---
name: agent-models
description: Os modelos do Cursor nos quatro papéis — scout, reach, implement, monitoring — e como delegar a subagentes sem sair do Cursor. Use ao delegar, ao escolher o modelo de um subagente, ou ao revisar o que ele entregou.
---

# agent-models — os modelos do Cursor

Mantenha a decisão e a integração com o agente principal. Delegue quando houver uma frente independente, e dê a cada subagente **um** papel. O papel decide o modelo; a tarefa decide o papel.

## Os quatro papéis

O que cada papel faz, como um alimenta o seguinte e de quem é cada skill estão no `agent.md` (global, e na raiz do projeto). Esta skill diz **com qual modelo** cada papel roda neste harness.

| Papel | O que faz | Modelo |
| --- | --- | --- |
| **scout** | busca e junta, barato e em paralelo, a informação que o reach precisa: localizar, inventariar, coletar. Só leitura | Composer 2.5 |
| **implement** | executa a tarefa que o reach planejou, com arquivos exclusivos. Não decide o caminho | Composer 2.5 |
| **monitoring** | confere o que o implement entregou, pelo diff e pela verificação. Não conserta | Grok 4.7 |
| **reach** | plano, arquitetura, ambiguidade central: a visão que o implement vai executar | Grok 4.7 |

**No Cursor usamos só Composer e Grok.** Composer é o barato e nativo; Grok é o mais capaz dos dois. Modelo de outro provedor se alcança pelo harness dele, via `orchestri`.

⚠️ **Os IDs não foram conferidos em `cursor-agent models`** (25/09/2026, sem login). Rode o comando e use o ID que ele listar.

- **A tarefa completa é o ciclo scout → reach → implement → monitoring.** O monitoring que reprova devolve ao implement com o que faltou (até 2 voltas); lacuna de spec volta ao reach. Pular um papel só com o motivo escrito — o reach que já sabe os arquivos dispensa o scout; a tarefa que é só decisão termina no reach.
- **Pague inteligência no reach e no monitoring, não no scout.** Vários scouts Composer e um monitoring Grok custam menos e acertam mais que vários Grok.
- **Todo papel delega.** Reach, implement ou monitoring — inclusive rodando como agente do Multica — mandam a varredura (localizar, ler log, inventariar) para um **scout**, no modelo barato, e ficam com o raciocínio. Um diagnóstico no modelo caro não lê o repositório inteiro sozinho.
- **monitoring fica acima do implement, e nunca é o mesmo modelo que construiu.** Grok é o monitoring aqui porque lidera a pista agêntica medida: 71,0% DeepSWE v1.1, 37,6% Terminal-Bench 4.0.
- **Grok é reach e monitoring ao mesmo tempo.** Quando ele planejou a fatia, a revisão dele herda o próprio plano: para trabalho crítico, peça o monitoring de outro harness pela `orchestri`.
- **implement com plano incompleto devolve a lacuna** ao principal em vez de decidir sozinho: decidir é do reach.
- Regra do projeto (piso de modelo, fluxo crítico) vence esta tabela.
- Tudo aqui fica **dentro do Cursor**. Mandar trabalho para Claude Code ou Codex é a skill `orchestri`, e só quando o usuário a chama.

## Como chamar

Headless, um subagente por processo: `cursor-agent -p --model <id> "<briefing>"`. Scouts independentes saem em paralelo.

## O briefing

Cada subagente recebe, e só isso:

- o papel e a definição observável de pronto;
- o contexto mínimo: caminhos, decisões já tomadas, restrições;
- o escopo de escrita — scout e monitoring só leem; implement tem arquivos exclusivos;
- o formato de volta: conclusão, evidência com `arquivo:linha`, o que mudou, o que ficou em aberto.

## Fechar

Diga qual modelo cada subagente usou e o que o monitoring encontrou. Modelo pedido e modelo confirmado pelo retorno são coisas diferentes: registre os dois.
