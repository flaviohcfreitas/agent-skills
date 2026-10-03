---
name: agent-loop-checks
description: "Escreve, confere e trava os checks de uma feature do agent-loop: lista em palavras (reach), gate humano, checks vermelhos (implement), prova de que falham pelo motivo certo (monitoring), gate humano, `travar` por hash. Use dentro do /agent-loop, antes de construir, ou ao pedir os checks de uma feature."
---

# agent-loop-checks

Os checks são a **nota** do agent-loop e o construtor **não os toca**. Por isso são escritos e aprovados **antes**, por outro passo, e travados por hash. Aprovar é ato **humano**; travar é script.

Roda no worktree da feature (`agent-loop` passo 4), nunca no checkout do usuário.

## O caminho (dois gates humanos)

1. **reach** escreve a **lista em palavras simples**: um item por check, com o que ele prova e o que **não** prova. Inclui sempre um check de **ligação**: "a feature é alcançável a partir do app" (rota, menu, endpoint registrado). É a lição de checks verdes com a tela desligada.
2. **A sessão mostra a lista ao usuário e espera. Gate humano 1.**
3. **implement** escreve os checks em `.agent-loop/<slug>/rascunho/` e o `rascunho/manifesto.json`:
   ```json
   { "comando": "node --test --test-reporter=tap .agent-loop/<slug>/checks/",
     "comando_guarda": "<os testes já existentes da área, para pegar regressão fora dos checks>",
     "arquivos": ["src/filtro/"], "lista": ["...em palavras, na mesma ordem..."], "total": 7 }
   ```
   O `comando` precisa dar **TAP** (ou a linha `{"agent_loop":{"passam":[…],"total":N}}`), e roda **local**, sem produção. O comando deve apontar para `checks/` (para onde o `travar` move o rascunho), não para `rascunho/`. `arquivos` são os que o loop pode mudar, com prefixo de pasta. Descubra o comando com um scout se preciso.
4. **monitoring** roda os checks e confere que **todos falham, e pelo motivo certo** (feature ausente, não erro de import ou de sintaxe) e que cobrem cada item da lista. Check que passa antes de construir não mede nada → volta ao implement.
5. **A sessão mostra os checks e a saída vermelha ao usuário e espera. Gate humano 2.**
6. Aprovado → `node ~/.agents/skills/agent-loop/scripts/agent-loop.mjs travar --raiz <worktree> --slug <slug>`. Ele move `rascunho/` para `checks/`, grava `manifesto.json` com `base` e `hash`, e faz **um commit** no branch `agent-loop/<slug>`. Imprime o `hash`: grave no corpo do card e passe ao workflow (`hash_checks`).

## O que o hash cobre

sha256 sobre `checks/`, os campos `comando`, `comando_guarda` e `arquivos` do manifesto, e o bloco "Regras fixas" do `.agent-loop/program.md`. Muda com 1 byte em qualquer um. O bloco "Como trabalhar" **não** entra. Mudar os checks depois do `travar` não é consertar: é refazer o gate 1 e o 2, e travar de novo.

## Não faça

- Aprovar no lugar do usuário, ou pular um gate.
- Deixar o implement do loop editar `checks/` ou `manifesto.json` (a regra de deny e o hash existem por isso).
- Check de gosto (visual, texto): se o pronto é gosto, a feature não é agent-loop.
