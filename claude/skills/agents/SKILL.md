---
name: agents
description: Os modelos do Claude Code nos quatro papéis — scout, reach, implement, monitoring — e como delegar a subagentes sem sair do Claude Code. Use ao delegar, ao escolher o modelo de um subagente, ou ao revisar o que ele entregou.
---

# agents — os modelos do Claude Code

Mantenha a decisão e a integração com a sessão principal. Delegue quando houver uma frente independente, e dê a cada subagente **um** papel. O papel decide o modelo; a tarefa decide o papel.

## Os quatro papéis

| Papel | O que faz | Modelo | Na Agent tool |
| --- | --- | --- | --- |
| **scout** | varredura barata e em paralelo: localizar, inventariar, coletar. Só leitura | Haiku 4.5 | `model: "haiku"` |
| **implement** | executa a tarefa que o reach planejou, com arquivos exclusivos. Não decide o caminho | Sonnet 5 | `model: "sonnet"` |
| **monitoring** | confere o que o implement entregou, pelo diff e pela verificação. Não conserta | Opus 5.5 | `model: "opus"` |
| **reach** | plano, arquitetura, ambiguidade central: a visão que o implement vai executar | Fable 5.1 | `model: "fable"`, ou a própria sessão quando ela já roda Fable |

- **Pague inteligência no reach e no monitoring, não no scout.** Dez scouts Haiku e um monitoring Opus custam menos e acertam mais que dez Sonnet.
- **Todo papel delega.** Reach, implement ou monitoring — inclusive rodando como agente do Multica — mandam a varredura (localizar, ler log, inventariar) para um **scout**, no modelo barato, e ficam com o raciocínio. Um diagnóstico no modelo caro não lê o repositório inteiro sozinho.
- **monitoring fica acima do implement, e nunca é o mesmo modelo que construiu.** Ele lê o diff, não o relato: o que o implement diz que fez e o que fez são duas coisas.
- **implement com plano incompleto devolve a lacuna** à sessão em vez de decidir sozinho: decidir é do reach.
- **Fable é o reach, não o atalho.** Tarefa que cabe no Opus fica no Opus; Fable entra quando errar o plano custa mais que o preço dele (US$ 10 · 50 por 1M).
- Regra do projeto (piso de modelo, fluxo crítico) vence esta tabela.
- Tudo aqui fica **dentro do Claude Code**. Mandar trabalho para Codex ou Cursor é a skill `orchestri`, e só quando o usuário a chama.

## O briefing

Cada subagente recebe, e só isso:

- o papel e a definição observável de pronto;
- o contexto mínimo: caminhos, decisões já tomadas, restrições;
- o escopo de escrita — scout e monitoring só leem; implement tem arquivos exclusivos;
- o formato de volta: conclusão, evidência com `arquivo:linha`, o que mudou, o que ficou em aberto.

Scouts independentes saem **na mesma mensagem**, em paralelo. A sessão não refaz a varredura que entregou a um scout.

## Fechar

Diga qual modelo cada subagente usou e o que o monitoring encontrou. Sem subagente disponível, faça na sessão e diga isso.
