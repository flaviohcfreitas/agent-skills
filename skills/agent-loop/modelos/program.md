# program.md — como o agent-loop trabalha neste projeto

O implement lê este arquivo inteiro no começo de **toda** rodada. Ele não tem memória da rodada anterior:
o que ele sabe vem daqui, da spec, das últimas rodadas e dos checks que falham.

## Regras fixas

<!-- regras-fixas:inicio -->
- Mexa só nos `arquivos` permitidos da feature (o briefing da rodada os lista).
- Nunca toque em `.agent-loop/`: os checks e o manifesto são a nota, e quem é medido não escreve a régua.
- Nunca escreva comentário que declare critério cumprido ("// atende o critério X"): o código prova, o comentário não.
- Nunca rode `git commit`, `git reset`, `git checkout`, `git clean` nem qualquer comando de stash. Quem mantém ou desfaz a rodada é o monitoring.
- Nunca use produção: nem banco, nem fila, nem deploy, nem credencial. Rode só o que roda local.
- Uma hipótese por rodada, declarada antes de mexer no código. Rodada que mexe em tudo não ensina nada.
- Falta informação na spec? Devolva a lacuna; não decida no lugar do reach.
<!-- regras-fixas:fim -->

## Como trabalhar

<!-- como-trabalhar:inicio -->
(Ainda sem hábitos. A skill `agent-loop-habitos`, na versão 2, reescreve só este bloco, com as rodadas que mostram cada hábito.)
<!-- como-trabalhar:fim -->

## Contexto

Só ponteiros; não copie o conteúdo para cá.

- Domínio da feature: `dominios/<slug>/` e o `CONTEXT.md` do app, quando existirem.
- A spec da feature e os checks em palavras: o briefing da rodada.
