---
name: agent-models
description: Os modelos do Codex nos quatro papéis — scout, reach, implement, monitoring — e como delegar a subagentes sem sair do Codex. Use ao delegar, ao escolher modelo ou esforço de um subagente, ou ao revisar o que ele entregou.
---

# agent-models — os modelos do Codex

Mantenha a decisão e integração com o agente principal. Delegue trabalho concreto quando houver uma frente independente útil enquanto o principal continua trabalhando. Esta skill orienta o uso das ferramentas nativas de subagentes do harness em que está instalada.

## Quando delegar

Use subagentes quando duas frentes puderem avançar independentemente, uma investigação delimitada puder fornecer evidências ao principal, uma validação demorada puder ocorrer em paralelo, ou uma revisão independente reduzir materialmente o risco. Não delegue se o próximo passo depende imediatamente da resposta, se o trabalho é menor que a coordenação ou se agentes precisariam editar os mesmos arquivos. Não divida artificialmente uma tarefa simples.

## Os quatro papéis

O que cada papel faz, como um alimenta o seguinte e de quem é cada skill estão no `agent.md` (global, e na raiz do projeto). Esta skill diz **com qual modelo** cada papel roda neste harness.

Cada subagente recebe **um** papel. O papel decide o modelo; a tarefa decide o papel.

O modelo de cada papel é `node ~/.agents/papeis/harnesses.mjs resolver <papel> --aqui codex`. `nativo: true` → spawn nativo com o `modelo` e o `esforco` que ele devolve; senão, `rodar` chama a CLI do harness escolhido e devolve a prova da execução. Ausente ou falhou → o próximo candidato, dito em voz alta. `PAPEIS_SO=codex` mantém tudo no Codex. No monitoring, passe `--construtor <harness:modelo de quem construiu>`.

Papéis em uma linha: **scout** busca e junta, só leitura; **implement** executa o plano do reach, com arquivos exclusivos; **monitoring** confere o diff e a verificação, sem consertar; **reach** decide.

- **A tarefa completa é o ciclo scout → reach → implement → monitoring.** O monitoring que reprova devolve ao implement com o que faltou (até 2 voltas); lacuna de spec volta ao reach. Pular um papel só com o motivo escrito — o reach que já sabe os arquivos dispensa o scout; a tarefa que é só decisão termina no reach.
- **Pague inteligência no reach e no monitoring, não no scout.** Vários scouts Luna e um monitoring Sol custam menos e acertam mais que vários Sol.
- **Todo papel delega.** Reach, implement ou monitoring — inclusive rodando como agente do Multica — mandam a varredura (localizar, ler log, inventariar) para um **scout**, no modelo barato, e ficam com o raciocínio. Um diagnóstico no modelo caro não lê o repositório inteiro sozinho.
- **monitoring fica acima do implement, e nunca é o mesmo modelo que construiu.** Revisão crítica sobe para `gpt-6-astra`.
- **implement com plano incompleto devolve a lacuna** ao principal em vez de decidir sozinho: decidir é do reach.
- Regra do projeto (piso de modelo, fluxo crítico) vence esta tabela.
- O papel cruza para outro harness pela tabela, dito em voz alta; quem quer ficar só no Codex usa `PAPEIS_SO=codex`.

Se indisponíveis, use equivalentes oferecidos pela sessão, mantendo a ordem scout ≤ implement < monitoring ≤ reach. Informe a substituição. Não altere a configuração global nem o modelo principal. Para busca factual simples e latência prioritária, reduza o esforço quando adequado.

Trate **leaf** como uma função: executa a tarefa recebida e devolve resultado, sem criar outros agentes. Trate **peer** como responsável por uma frente: pode colaborar e subdelegar apenas se a sessão permitir e existir ganho concreto. Não deduza capacidades apenas pelo nome do modelo. Comece com a menor equipe útil, normalmente 1–2 filhos, dentro do limite de concorrência da sessão. Uma nova camada precisa de uma razão explícita; não crie árvores recursivas por padrão.

## Delegação

Antes de disparar, informe brevemente a frente, o papel (scout, implement, monitoring ou reach), o modelo solicitado, o esforço e se é leaf ou peer. Use as ferramentas disponíveis de spawn, mensagens e espera, respeitando sua assinatura real. Ao delegar, solicite o modelo e o esforço da tabela apenas pelos parâmetros que a ferramenta realmente oferecer. Passe só o contexto necessário; se o harness herdar ou escolher o modelo automaticamente, confirme o resultado quando possível.

Cada instrução de delegação deve conter:

- Objetivo e definição observável de pronto.
- Contexto mínimo, caminhos/fontes concretos, restrições e decisões já tomadas.
- Escopo de escrita: leitura apenas por padrão para scouts/revisores; arquivos exclusivos para implementação.
- Leaf ou peer; no segundo caso, limites de subdelegação e coordenação.
- Retorno curto: conclusão, evidências com caminhos/linhas ou links, alterações, validações e dúvidas restantes.

Exemplo de briefing leaf: “Localize onde o checkout valida cupons em /caminho/repo. Apenas leitura; não delegue. Retorne o fluxo, arquivos/linhas relevantes e lacunas de cobertura de testes. Não implemente mudanças.”

Não envie histórico inteiro quando um briefing basta. Não repita no principal a investigação entregue ao filho. O principal continua com integração, decisões ou outra frente independente. Use mensagens para desbloquear dependências e ajustar escopo; evite sondagens frequentes ou copiar logs extensos para o contexto principal.

## Jev global: decidir antes e conferir depois

Quando houver uma frente independente candidata, use o juiz compartilhado em `~/.agents/skills/decision-gate`. Com a chave global disponível, prepare um JSON temporário com `pedido`, `frente_principal` (o trabalho útil que continuará no principal) e até seis `candidatos`; cada candidato tem `id`, `tarefa`, `entrega`, `modelo`, `esforco` e `custo_relativo` de 1 a 4. Escolha modelos oferecidos pela sessão conforme os papéis acima. Rode `node ~/.agents/skills/decision-gate/scripts/rotear.mjs --input <arquivo.json>`. `despachar: false` mantém o trabalho no principal; `despachar: true` recomenda apenas o candidato retornado. Confirme escopo, autorização, ferramentas e concorrência antes de agir. O juiz não dispara agentes nem contraria escolhas explícitas do usuário ou regras do projeto.

Quando a mesma frente puder usar mais de um modelo oferecido pela sessão, inclua alternativas com a mesma `tarefa` e `entrega`, mas `id`, `modelo`, `esforco` e `custo_relativo` próprios. Assim o Jev escolhe agente **e** modelo em uma decisão, preferindo o menor custo entre opções adequadas. Não consulte o Jev para comparar modelos se o usuário já escolheu um ou se só há uma opção real.

Depois da volta, grave o brief e o retorno em arquivos temporários e rode `node ~/.agents/skills/decision-gate/scripts/juiz.mjs --saida --brief-arquivo <brief> --saida-arquivo <retorno>`. Exit `0` sugere que cumpre: confira as evidências reais antes de integrar. Exit `2` indica incompletude: identifique a lacuna comparando brief e retorno e permita uma nova tentativa. Exit `3` exige análise do principal; peça decisão ao usuário somente se ela não puder ser tomada dentro do escopo autorizado. Exit `1` é erro, não veredito: valide manualmente e informe que o juiz falhou. Sem chave ou com API indisponível, faça a escolha de delegação pelas regras desta skill e informe que o Jev não foi consultado.

Antes de declarar pronta uma alteração de código feita nesta orquestração, rode a verificação adequada e chame `node ~/.agents/skills/decision-gate/scripts/juiz.mjs --gate --spec-arquivo <spec> --verificar-saida <resultado>` na raiz do projeto. Use como spec os critérios de aceite reais do pedido e como resultado a saída da verificação executada; confira se o diff avaliado inclui todos os arquivos da entrega. Se o diff padrão (`git diff HEAD`) não representar a entrega completa, passe `--diff-arquivo <diff>` com o material correto. Trate os exit codes como acima: `0` permite seguir após conferir as evidências, `2` pede correção e nova verificação, `3` exige decisão do principal ou do usuário quando necessária, e `1` exige avaliação manual com aviso de que o Jev falhou. O gate não substitui testes nem review. Para entregas sem código, diff ou verificação aplicável, avalie os critérios diretamente; não fabrique esses insumos para obter um veredito.

## Integração e encerramento

Os agentes compartilham arquivos salvo isolamento explícito. Distribua a propriedade das edições, preserve mudanças existentes e comunique alterações de contratos. Delegação não amplia autorização para publicar, implantar ou modificar sistemas externos.

Confira evidências importantes, integre resultados e execute validação proporcional ao risco. Se um filho ficar bloqueado, delimite melhor ou escale a parte difícil; não repita indefinidamente a mesma solicitação. Cancele trabalho que deixou de ser necessário e não deixe agentes editando após concluir a resposta.

Entregue o resultado consolidado, verificações realizadas e limitações. Diferencie modelos solicitados de modelos confirmados pelo retorno da ferramenta. Não prometa economia percentual: subagentes podem aumentar tokens totais; a vantagem potencial é custo, tempo ou menor ruído no contexto principal. Só compare economia com medição equivalente.

Memória persistente é opcional: use apenas a integração já disponível e autorizada. Não instale mem0 nem grave memória automaticamente por causa desta skill. Sem ferramentas de subagentes, execute localmente e informe a limitação.

## Origem

Adaptação da explicação e demonstração de Rafael Quintanilha, especialmente 22:36–31:12, não uma cópia do arquivo original: https://www.youtube.com/watch?v=n4e5wV3unA4

Confirme as capacidades atuais na documentação do harness antes de depender de uma opção específica.
