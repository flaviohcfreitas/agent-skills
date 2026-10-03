---
name: agent-loop
description: "Constrói UMA feature em rodadas, no método do Karpathy: cada rodada é um experimento que o monitoring nota com checks travados e o Jev, e que fica (commit) ou é desfeita (reset). Use quando a tarefa cumpre os 4 critérios (repete, cabe no orçamento, conferível sem humano, roda local), ou ao chamar /agent-loop. Só no Claude Code; implement Sonnet, monitoring Fable."
---

# agent-loop

Um loop que constrói **uma feature** até ela ficar pronta. Cada rodada: o implement (contexto novo) muda o código com **uma hipótese**; o monitoring roda os checks que o implement **não pode tocar** e o Jev; a rodada que avança **fica** (um commit), a que não avança é **desfeita** (reset). O estado mantido nunca piora.

Spec: `~/Sources/agents/specs/loop-karpathy.md`. A ordem, os tetos e a decisão da rodada são **código** (workflow `agent-loop-rodadas`, script `scripts/agent-loop.mjs`); esta skill guarda os gates humanos.

## Só Claude Code, só Claude

O workflow `.js` só roda no Claude Code. Em Codex e Cursor, faça os passos 1 a 6 e pare, dizendo isso. O loop usa **só modelos Claude**: implement no Sonnet (`claude-sonnet-5-5`, nativo) e monitoring no **Fable** (`claude-fable-5-1`), que chega por uma ponte: o briefing de cada passo do monitoring traz a linha `PAPEIS: PAPEIS_SO=claude --escalada`, e o subagente roda o resolver com isso (`~/.agents/papeis/harnesses.mjs`). O workflow confere em código `modelo` e `execucao.comando` (`--model fable`); fora disso, a corrida para em `harness`.

## Antes de tudo: a trava de permissão (é do usuário)

A camada mais fraca da trava dos checks é uma regra de deny, e **permissão não é do agente**. Peça ao usuário, uma vez, para colar em `~/.claude/settings.json`, dentro de `permissions` (se já existe `deny`, acrescente as duas linhas), e conferir com `/permissions`:

```json
"deny": [
  "Edit(**/.agent-loop/*/checks/**)",
  "Edit(**/.agent-loop/*/manifesto.json)"
]
```

Ela não cobre escrita por Bash (`sed -i`, `>`); por isso existem o hash e o escopo da rodada, que são código.

## O caminho

1. **Confira os 4 critérios, por escrito, um a um.** Algum falha → diga qual, proponha o caminho certo (laço de refaz; ou a feature quebrada em menores) e **pare**.

   | # | Critério | Falha quando |
   |---|---|---|
   | 1 | **Repete**: várias features, ou uma com muitas tentativas prováveis | uma linha, ou o caminho já está claro |
   | 2 | **Cabe no orçamento**: toda rodada relê o contexto; estime ≈ rodadas × (implement + monitoring), teto padrão 12 | a feature exige ler o monorepo inteiro a cada rodada |
   | 3 | **Conferível sem humano**: um comando dá a nota | o pronto é gosto (visual, texto), ou **fluxo crítico** (crédito, dinheiro, cadastro, auth) |
   | 4 | **O agente roda o que construiu** e vê o que quebra | depende de produção, credencial humana ou serviço externo sem dublê |

   **Fluxo crítico nunca é agent-loop sugerido.** Chamado pelo nome, o workflow trava (`estado: critico`, zero agentes) sem `autorizar_critico: true`; autorizado, o melhor fim é `revisao_humana`, nunca `pronto`.
2. **Card** (Multica, `multica` skill): ache ou crie o card da feature no projeto, `[S<n>] Agent-loop: <feature>`, sempre `--no-start`. Sem Multica (outro projeto, sem CLI ou sem projeto), rode só com os arquivos e **diga isso na primeira linha**.
3. **Spec da feature** pelo **reach** (`to-spec` sobre o card): objetivo, critérios de pronto, `arquivos` permitidos (com prefixo de pasta). Vai para o **corpo** do card. Fato faltando (onde mora o código, que comando roda o teste) → **scout**.
4. **Worktree**, nunca o checkout do usuário:
   `git worktree add <repo>/.claude/worktrees/agent-loop-<slug> -b agent-loop/<slug> HEAD`, e instale as dependências lá. Trabalho do usuário sem commit **não entra**: se `git status` não está limpo, avise e pergunte se a feature depende dele.
5. **Checks**: chame `agent-loop-checks` (lista em palavras → gate humano 1 → checks vermelhos → gate humano 2 → `travar`). O `hash` impresso pelo `travar` é o que o workflow exige.
6. **`program.md`**: se `.agent-loop/program.md` não existe no worktree, copie `modelos/program.md` desta skill (o `travar` também o faz). Ele tem "Regras fixas" (entram no hash), "Como trabalhar" (muda só pela `agent-loop-habitos`, v2) e "Contexto" (só ponteiros).
7. **Dispare:** `Workflow({ name: 'agent-loop-rodadas', args: { slug, raiz, hash_checks, spec, card?, rodadas?, critico?, autorizar_critico? } })`. `raiz` é o caminho absoluto do worktree; `rodadas` padrão 12, teto duro 30.
8. **Relate** `estado`, `motivo`, `proximo_passo`, a nota (`passam/total`) e o link do card. Depois:
   - `node ~/.agents/skills/agent-loop/scripts/agent-loop.mjs publicar --raiz <raiz> --slug <slug> --card <card>` (sobe os comentários que a rede perdeu; idempotente);
   - em `pronto` ou `revisao_humana`: `… fechar --raiz <raiz> --slug <slug>` (copia o `rodadas.jsonl` para `resultados.jsonl`, escreve o `relatorio.md`, um commit);
   - o card vai a `in_review --no-start`, com o contrato de monitoramento. `done` é do humano.
   Levar o branch `agent-loop/<slug>` ao branch de trabalho, o PR e o merge são **da sessão, com o humano**. Fechar o worktree (`git worktree remove`) também: worktree esquecido pesa gigabytes.

## Os estados

`pronto` · `revisao_humana` · `refaz_fechamento` (o fechamento reprovou; **não volta sozinho**) · `estagnou` (4 desfeitas seguidas) · `teto` · `orcamento` · `humano` (Jev não julgou, ou mandou ao humano) · `violacao` (hash dos checks, script ou decisão não batem: não confie na corrida) · `harness` · `sem_git` · `lacuna` · `critico` · `invalido`. Cada um traz `proximo_passo`.

## O que o script faz (`scripts/agent-loop.mjs`)

Quem o roda é o monitoring, nunca o implement. Tudo que escreve no git **recusa o checkout principal e qualquer branch fora de `agent-loop/`**; não existe `git stash` nele (o stash é compartilhado entre worktrees).

- `travar --slug s`: move `rascunho/` para `checks/`, grava `manifesto.json` (`base`, `comando`, `comando_guarda`, `arquivos`, a lista em palavras, `hash`) e commita. Imprime o `hash`.
- `preflight`: worktree, branch, árvore limpa, hash, comando dos checks, e **um commit vazio seguido de reset** (prova que o `claude -p` do monitoring escreve no git do worktree).
- `rodada`: trava (hash) → escopo (`arquivos`) → checks → guarda → Jev → `decidirRodada` → mantém (`git add` + `git commit`, com hooks) ou desfaz (patch em `descartadas/`, `reset --hard`, `clean -fd`) → `rodadas.jsonl` (encadeado) → comentário no card, com CPF, CNPJ e telefone trocados por `[pii]`.
- `publicar`, `fechar`, `habitos --conferir` (falha se algo fora do bloco "Como trabalhar" mudou).

**O contrato do `comando` dos checks:** TAP no stdout (`ok 1 - nome` / `not ok 2 - nome`, sem indentação; `node --test --test-reporter=tap`) ou uma linha `{"agent_loop":{"passam":["id"],"total":N}}`. O nome do check é o id dele.

**A nota:** os checks dizem se **avançou** (mais verdes, sem regressão e com a guarda verde → mantém); o Jev diz se **acabou** (`passou` com todos verdes → fechamento) e se deve **parar** (`humano`). O Jev nunca passa o que um check reprova. Tabela completa: seção 7.1 da spec, em `decidirRodada`.

## O que fica fora

`agent-loop-habitos` (o auto-loop que reescreve "Como trabalhar") é a **versão 2**: na v1 só o `rodadas.jsonl` (o contrato de dados) entra. Várias features numa invocação: uma chamada por feature, na ordem do `[S<n>]`. A cópia no MenosJuros (`.claude/skills/`, catálogo, contagem) é ticket próprio.
