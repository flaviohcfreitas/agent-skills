# agent-loop-brinquedo

Fixture do T0 do agent-loop (`specs/loop-karpathy.md`): uma feature mínima, para uma corrida real e barata.

**Feature:** `src/estatistica.mjs` (`media`, `mediana`, `moda`) e `src/index.mjs`. A spec está em `spec.md` (vai em `args.spec`, e é o que o Jev lê); o plano por rodada está em `program.md`, no bloco "Como trabalhar" (que não entra no hash).

- `rascunho/run.mjs`: 5 checks em TAP, todos vermelhos antes de construir; o 5º é o de **ligação**.
- `rascunho/manifesto.json`: comando, guarda, arquivos e a lista em palavras.
- O plano por rodada é a armadilha: a rodada 1 fica parcial de propósito (3 de 5 checks, o Jev real deve dar `refaz`, e a rodada se mantém pelo avanço); a rodada 2 é um experimento sem avanço (desfeita); a 3 fecha. Isso cobre "≥1 mantida e ≥1 desfeita" e o T9 (Jev `refaz` dentro do monitoring Fable com o hook-stop ativo).

Uso: copie `src/` para um repo descartável com worktree `agent-loop/estat`, `program.md` para `.agent-loop/program.md`, `rascunho/` para `.agent-loop/estat/rascunho/`, rode `agent-loop.mjs travar --slug estat`, e dispare o workflow com `spec.md` como `args.spec`.
