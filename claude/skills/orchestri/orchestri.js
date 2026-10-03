export const meta = {
  name: 'orchestri',
  description: 'Grafo Jev (porta) → to-map+scouts ou scouts+grilling → to-spec → to-tickets → implement (N, em paralelo, cada um com seu monitoring) → Jev, em loop até a tarefa fechar; cada papel no harness do plano',
  whenToUse: 'Chamado pela skill orchestri, com args { tarefa, flags?, respostas?, autorizar_critico? } — harnesses, porta do Jev e PR rodam dentro do grafo',
  phases: [
    { title: 'Harnesses', detail: 'detecta os CLIs instalados e monta o plano por papel (harnesses.mjs)' },
    { title: 'Porta', detail: 'o Jev decide: grande (to-map, Fable) ou pequena (grilling, Opus)' },
    { title: 'Mapa', detail: 'grande (pelo Jev): to-map no grafo, sem publicar — destino, fatias, decisões, névoa' },
    { title: 'Scout', detail: 'dirigidos pelos tickets research do mapa, ou ângulos fixos na tarefa pequena' },
    { title: 'Grilling', detail: 'pequena: grilling + domain-modeling; pode subir para o mapa' },
    { title: 'Protótipo', detail: 'um Claude num painel do Herdr roda a skill prototype e publica como artifact; o usuário julga na conversa do painel' },
    { title: 'Questionário', detail: 'o grilling num painel do Herdr, com um Claude conversando com o usuário, enquanto os scouts rodam; confirmação antes da spec' },
    { title: 'Spec', detail: 'to-spec: a spec fechada da tarefa' },
    { title: 'Tickets', detail: 'to-tickets: tickets com arquivos exclusivos e dependência' },
    { title: 'Implement', detail: 'um implement por ticket, em ondas de dependência' },
    { title: 'Monitoring', detail: 'um monitoring por implement, com a skill code-review (Standards e Spec): passou, refaz ou humano' },
    { title: 'Jev', detail: 'o juiz julga o todo: spec + diff completo + verificação → passou · refaz · humano' },
    { title: 'Adversarial', detail: 'gauntlet: régua fixada antes (4×20, zero defeito); o adversarial ataca, defeito vira ticket de correção, e o grafo volta até bater a régua (teto 3)' },
    { title: 'PR', detail: 'passou pelo Jev: branch, commit só dos arquivos entregues, push e gh pr create; merge é humano' },
  ],
}

// --- contratos ----------------------------------------------------------------------------

const ACHADOS = {
  type: 'object',
  properties: {
    achados: { type: 'array', items: { type: 'object', properties: { fato: { type: 'string' }, endereco: { type: 'string' } }, required: ['fato', 'endereco'] } },
    lacunas: { type: 'array', items: { type: 'string' } },
  },
  required: ['achados', 'lacunas'],
}

const TICKET = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    objetivo: { type: 'string' },
    arquivos: { type: 'array', items: { type: 'string' } },
    criterio_pronto: { type: 'array', items: { type: 'string' } },
    depende_de: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'objetivo', 'arquivos', 'criterio_pronto'],
}

const PERGUNTAS = { type: 'array', items: { type: 'object', properties: { pergunta: { type: 'string' }, recomendacao: { type: 'string' }, opcoes: { type: 'array', items: { type: 'string' } } }, required: ['pergunta', 'recomendacao'] } }
const LISTA = { type: 'array', items: { type: 'string' } }

const DESCOBERTA = {
  type: 'object',
  properties: {
    perguntas: PERGUNTAS,
    mais_fatos: LISTA,
    suposicoes: LISTA,
    resumo: { type: 'string' },
    precisa_mapa: { type: 'boolean' },
    motivo_mapa: { type: 'string' },
  },
  required: ['resumo'],
}

const SPEC = {
  type: 'object',
  properties: {
    estado: { type: 'string', enum: ['spec', 'perguntas', 'mais_fatos'] },
    perguntas: PERGUNTAS,
    mais_fatos: LISTA,
    critico: { type: 'boolean' },
    suposicoes: LISTA,
    spec: {
      type: 'object',
      properties: {
        objetivo: { type: 'string' },
        criterio_pronto: LISTA,
        mudancas: { type: 'array', items: { type: 'object', properties: { onde: { type: 'string' }, o_que: { type: 'string' } }, required: ['onde', 'o_que'] } },
        fora_do_escopo: LISTA,
      },
      required: ['objetivo', 'criterio_pronto'],
    },
  },
  required: ['estado'],
}

const TICKETS = { type: 'object', properties: { tickets: { type: 'array', items: TICKET } }, required: ['tickets'] }

const IMPLEMENT = {
  type: 'object',
  properties: {
    arquivos: { type: 'array', items: { type: 'string' } },
    verificacao: { type: 'object', properties: { comando: { type: 'string' }, passou: { type: 'boolean' }, saida: { type: 'string' } }, required: ['comando', 'passou'] },
    lacuna: { type: 'string' },
    decisoes: { type: 'array', items: { type: 'string' } },
    falha_harness: { type: 'string' },
  },
  required: ['arquivos', 'verificacao'],
}

const MONITORING = {
  type: 'object',
  properties: {
    veredito: { type: 'string', enum: ['passou', 'refaz', 'humano'] },
    faltou: { type: 'array', items: { type: 'string' } },
    motivo: { type: 'string' },
    code_review: { type: 'object', properties: { standards: { type: 'array', items: { type: 'string' } }, spec: { type: 'array', items: { type: 'string' } }, bloqueia: { type: 'boolean' } }, required: ['bloqueia'] },
    criterios: { type: 'array', items: { type: 'object', properties: { criterio: { type: 'string' }, atende: { type: 'boolean' }, evidencia: { type: 'string' } }, required: ['criterio', 'atende'] } },
  },
  required: ['veredito', 'motivo'],
}

const JUIZ = {
  type: 'object',
  properties: {
    exit: { type: 'integer' },
    confianca: { type: 'number' },
    stderr: { type: 'string' },
    verificacao: { type: 'object', properties: { comando: { type: 'string' }, passou: { type: 'boolean' }, resumo: { type: 'string' } }, required: ['comando', 'passou'] },
  },
  required: ['exit', 'verificacao'],
}

// <plano> — bloco puro, copiado para orchestri.js por sincronizar.mjs (o teste confere). Sem import aqui dentro.
// O binário de cada harness. O Cursor é `cursor-agent`, nunca `agent`: o Grok instala um `agent` próprio.
const HARNESSES = {
  claude: { bin: 'claude' },
  codex: { bin: 'codex' },
  cursor: { bin: 'cursor-agent' },
  grok: { bin: 'grok' },
}

// Preferência por papel: o primeiro candidato com harness permitido e disponível ganha.
const PREFERENCIA = {
  scout: [
    { harness: 'codex', modelo: 'gpt-6-luna', esforco: 'medium', provedor: 'openai' },
    { harness: 'cursor', modelo: 'composer-2.5', esforco: null, provedor: 'cursor' },
    { harness: 'claude', modelo: 'claude-haiku-4-5', esforco: null, provedor: 'anthropic' },
  ],
  reach: [
    { harness: 'claude', modelo: 'claude-opus-5-5', escalada: 'claude-fable-5-1', esforco: 'high', provedor: 'anthropic' },
    { harness: 'codex', modelo: 'gpt-6-astra', esforco: 'high', provedor: 'openai' },
    { harness: 'cursor', modelo: 'grok-4.7-high', esforco: null, provedor: 'xai' },
  ],
  implement: [
    // O implement é o Grok 4.7 no Cursor, com o esforço no ID: o Cursor não lista "grok-4.7" puro (cursor-agent --list-models,
    // 27/09/2026), e o 71,0% do DeepSWE foi medido no high. A CLI própria do Grok é o mesmo modelo por outro caminho.
    { harness: 'cursor', modelo: 'grok-4.7-high', esforco: null, provedor: 'xai' },
    { harness: 'grok', modelo: 'grok-4.7', esforco: null, provedor: 'xai' },
    // Sem o Grok, o Sol constrói e o Fable confere — o par só vale com o Claude permitido (regra do Flávio, 27/09/2026).
    { harness: 'codex', modelo: 'gpt-6-sol', esforco: 'high', provedor: 'openai', requer: 'claude',
      monitoring: { harness: 'claude', modelo: 'claude-fable-5-1', esforco: 'high', provedor: 'anthropic' } },
    { harness: 'cursor', modelo: 'composer-2.5', esforco: null, provedor: 'cursor' },
    { harness: 'codex', modelo: 'gpt-6-luna', esforco: 'xhigh', provedor: 'openai' },
    { harness: 'claude', modelo: 'claude-sonnet-5-5', esforco: null, provedor: 'anthropic' },
  ],
  monitoring: [
    { harness: 'codex', modelo: 'gpt-6-sol', esforco: 'max', provedor: 'openai' },
    { harness: 'claude', modelo: 'claude-opus-5-5', esforco: 'high', provedor: 'anthropic' },
    { harness: 'cursor', modelo: 'grok-4.7-high', esforco: null, provedor: 'xai' },
  ],
}

// O comando sem tela de cada harness externo. O briefing entra por arquivo ({briefing}).
// Claude não tem comando: roda como subagente nativo do workflow.
// Scout e reach só leem. O implement escreve. O monitoring roda a verificação e o juiz — precisa de
// shell, tmp e rede —, e "não conserta" é regra do prompt dele, não do sandbox.
function comando(c, papel) {
  const escreve = papel === 'implement'
  const executa = escreve || papel === 'monitoring'
  switch (c.harness) {
    case 'codex':
      return ['codex', 'exec', '-m', c.modelo, ...(c.esforco ? ['-c', `model_reasoning_effort=${c.esforco}`] : []),
        '-s', executa ? 'workspace-write' : 'read-only',
        ...(papel === 'monitoring' ? ['-c', 'sandbox_workspace_write.network_access=true'] : []),
        '--skip-git-repo-check', '-', '<', '{briefing}']
    case 'grok':
      // --prompt-file e -p são excludentes: o briefing entra só pelo arquivo.
      return ['grok', '-m', c.modelo, ...(executa ? ['--always-approve'] : []), '--prompt-file', '{briefing}']
    case 'cursor':
      return ['cursor-agent', '-p', '--trust', '--output-format', 'text', '--model', c.modelo,
        ...(executa ? ['--force'] : ['--mode', 'ask']), '"$(cat {briefing})"']
    default:
      return null
  }
}


function planejar(disponiveis, pedidos = []) {
  const desconhecidos = pedidos.filter((h) => !HARNESSES[h])
  if (desconhecidos.length) throw new Error(`harness desconhecido: ${desconhecidos.join(', ')}`)
  const ausentes = pedidos.filter((h) => !disponiveis.includes(h))
  if (ausentes.length) throw new Error(`harness pedido e não instalado: ${ausentes.join(', ')}`)
  const permitidos = pedidos.length ? pedidos : disponiveis
  const avisos = []
  const cabe = (c) => permitidos.includes(c.harness) && (!c.requer || permitidos.includes(c.requer))
  const escolher = (papel, filtro = () => true) => PREFERENCIA[papel].find((c) => cabe(c) && filtro(c))
  const semPar = ({ monitoring, requer, ...c }) => c

  // Implement só entra se houver quem o confira: o par dele, outro provedor, ou ao menos outro modelo.
  const monitoringPara = (imp) => {
    const par = imp.monitoring && permitidos.includes(imp.monitoring.harness) ? imp.monitoring : null
    return par ?? escolher('monitoring', (c) => c.provedor !== imp.provedor) ?? escolher('monitoring', (c) => c.modelo !== imp.modelo)
  }
  const papeis = {}
  for (const papel of ['scout', 'reach', 'implement']) {
    const c = papel === 'implement' ? escolher(papel, (x) => !!monitoringPara(x)) : escolher(papel)
    if (!c) throw new Error(`nenhum harness permitido roda o papel ${papel} (permitidos: ${permitidos.join(', ')})`)
    papeis[papel] = { ...semPar(c), comando: comando(c, papel) }
  }
  // Monitoring: outro provedor que o implement; sem isso, ao menos outro modelo.
  const imp = papeis.implement
  const mon = monitoringPara(escolher('implement', (c) => c.modelo === imp.modelo && c.harness === imp.harness))
  if (!mon) throw new Error('nenhum monitoring com modelo diferente do implement')
  if (mon.provedor === imp.provedor) avisos.push(`monitoring (${mon.modelo}) é do mesmo provedor que o implement (${imp.modelo}): só há um provedor permitido`)
  papeis.monitoring = { ...mon, comando: comando(mon, 'monitoring') }

  for (const [papel, c] of Object.entries(papeis)) {
    if (c.harness !== PREFERENCIA[papel][0].harness) avisos.push(`${papel} caiu para ${c.harness} (${c.modelo}): o padrão ${PREFERENCIA[papel][0].harness} não está permitido ou instalado`)
  }
  // Reserva: o Grok pode falhar na hora (erro, cota). O workflow troca o ticket para este par.
  let reserva = null
  if (imp.modelo.startsWith('grok-4.7')) {
    const r = PREFERENCIA.implement.find((c) => c.monitoring && cabe(c))
    if (r && permitidos.includes(r.monitoring.harness)) {
      reserva = { implement: { ...semPar(r), comando: comando(r, 'implement') }, monitoring: { ...r.monitoring, comando: comando(r.monitoring, 'monitoring') } }
    }
  }
  return { modo: pedidos.length ? pedidos.join('+') : 'todos', disponiveis, permitidos, papeis, reserva, avisos }
}

// </plano>

// --- entrada ------------------------------------------------------------------------------

const tarefa = args?.tarefa
if (!tarefa) throw new Error('orchestri precisa de args.tarefa')
// args.repo: rodar o grafo em outro repositório. Todo nó recebe o caminho e trabalha nele.
const REPO = args?.repo
const ag = (prompt, opts) => agent(REPO ? `REPOSITÓRIO DE TRABALHO: ${REPO} — rode todo comando com "cd ${REPO} && …" e use caminhos a partir dele; não toque em nenhum outro repositório.\n\n${prompt}` : prompt, opts)
// O plano nasce dentro do grafo (nó Harnesses), para a zoe e o /workflows mostrarem o grafo inteiro.
let plano = args?.plano
if (!plano) {
  phase('Harnesses')
  const h = await ag(
    'Rode exatamente: node ~/.claude/skills/orchestri/harnesses.mjs --disponiveis\nEle imprime uma lista JSON curta dos harnesses instalados. Devolva essa lista em "disponiveis", sem mudar nada, e o exit code.',
    { label: 'harnesses', phase: 'Harnesses', model: 'haiku',
      schema: { type: 'object', properties: { exit: { type: 'integer' }, disponiveis: { type: 'array', items: { type: 'string', enum: ['claude', 'codex', 'cursor', 'grok'] } } }, required: ['exit', 'disponiveis'] } })
  if (!h || h.exit !== 0) return { estado: 'humano', tarefa, motivo: 'harnesses: o nó não detectou os CLIs' }
  // O plano sai do código (o bloco <plano> abaixo, copiado de harnesses.mjs), nunca de um modelo.
  try { plano = planejar(h.disponiveis, (args?.flags ?? []).map((f) => String(f).replace(/^-+/, ''))) }
  catch (e) { return { estado: 'humano', tarefa, motivo: `harnesses: ${e.message}` } }
  log(`plano ${plano.modo}: ${Object.entries(plano.papeis).map(([k, v]) => `${k}=${v.harness}:${v.modelo}`).join(' · ')}${plano.avisos?.length ? ' — avisos: ' + plano.avisos.join('; ') : ''}`)
}
const respostas = [...(args?.respostas ?? [])]   // cresce com cada questionário respondido
// Resposta a pergunta do to-spec não reabre o grilling nem o mapa: cada resposta leva a rota de origem.
const respostasDescoberta = () => respostas.filter((r) => r?.rota !== 'to-spec' && r?.rota !== 'aprovacao')
// O mapa aparece na janela principal a cada rodada; a lista vai no resultado do grafo.
const mapas = []
const MAX_VOLTAS_TICKET = 2   // refaz por ticket
const MAX_RODADAS = 3         // reach → implement → monitoring, até a tarefa fechar
const MAX_TICKETS_MAPA = 12   // sessões do to-map (um ticket cada) antes de devolver ao usuário
// Regra que protege dinheiro fica em código: o tema marca o crítico, diga o reach o que disser.
const TEMA_CRITICO = /cr[eé]dito|parcela|pagamento|d[eé]bito|cobran[çc]a|juros|cadastro|autentica|login|senha|\bcpf\b|\bcnpj\b|open finance|proposta/i
const temaCritico = TEMA_CRITICO.test(tarefa.replace(/menos[-_ ]?juros/gi, ''))   // o nome do projeto não é tema
const decididoSozinho = []
const linhas = []   // a linha de cada frente, para o fechamento

const texto = (o) => JSON.stringify(o, null, 2)
const fim = (estado, extra) => ({ estado, tarefa, modo: plano.modo, avisos: plano.avisos ?? [], frentes: linhas, decidido_sozinho: decididoSozinho, mapas, ...extra })
const ALIAS = { 'claude-haiku-4-5': 'haiku', 'claude-sonnet-5-5': 'sonnet', 'claude-opus-5-5': 'opus', 'claude-fable-5-1': 'fable' }

// --- a ponte: cada papel roda no harness do plano -----------------------------------------
// Claude: subagente nativo com o modelo do papel. Externo: um subagente barato executa o comando
// sem tela do harness e só transcreve a saída no contrato — não opina, não refaz o trabalho.
async function rodar(papel, prompt, { label, phase, schema, modelo, candidato }) {
  const c = candidato ?? plano.papeis[papel]
  const m = modelo ?? c.modelo
  linhas.push({ frente: label, papel, harness: c.harness, modelo: m })
  if (c.harness === 'claude') {
    return ag(prompt, { agentType: papel, model: ALIAS[m] ?? m, effort: c.esforco ?? undefined, label, phase, schema })
  }
  const cmd = c.comando.join(' ')
  // A ponte prova que o CLI rodou: comando, exit e o fim da saída. Sem prova, é falha do harness —
  // a ponte nunca faz o trabalho no lugar do modelo (no teste de 27/09/2026 ela fez, e o grafo mentiu).
  const comProva = { ...schema, properties: { ...schema.properties, execucao: { type: 'object', properties: { comando: { type: 'string' }, exit: { type: 'integer' }, fim_da_saida: { type: 'string' } }, required: ['comando', 'exit', 'fim_da_saida'] } }, required: [...(schema.required ?? []), 'execucao'] }
  const r = await ag(
    `Você é a PONTE para o harness ${c.harness} (${m}). PROIBIDO fazer o trabalho você mesmo: não escreva código, não julgue, não pesquise — só rode o CLI e transcreva.\n` +
    `1. Grave o briefing abaixo, inteiro, num arquivo temporário em "$TMPDIR" (mktemp).\n` +
    `2. Rode: ${cmd}\n   trocando {briefing} pelo caminho do arquivo. O Bash tem teto de 10 min por chamada: rode em background, com a saída num arquivo, e acompanhe até o processo terminar (até 30 min).\n` +
    `3. Preencha execucao com o comando que rodou, o exit code real e as últimas linhas da saída. Comando bloqueado pela permissão, erro do CLI, cota, login ou timeout: exit diferente de 0 e a mensagem em fim_da_saida — e PARE, sem tentar de outro jeito.\n` +
    `4. Preencha o contrato SÓ com o que a saída do CLI diz` + (papel === 'implement' ? ` e com o que \`git status --short\` mostra depois.` : '.') + '\n\n' +
    `--- BRIEFING (papel ${papel}) ---\n${prompt}\n--- FIM ---\n` +
    `Peça ao harness que termine com um bloco JSON no formato do contrato.`,
    { model: 'haiku', label: `${label}@${c.harness}`, phase, schema: comProva },   // sem agentType: o prompt de scout/monitoring proíbe gravar o briefing
  )
  const e = r?.execucao
  if (!e || e.exit !== 0 || !e.fim_da_saida?.trim()) {
    const falha = `${c.harness} (${m}) não rodou: ${e ? `exit ${e.exit} — ${(e.fim_da_saida ?? '').slice(0, 300)}` : 'a ponte não trouxe prova de execução'}`
    log(`${label}: ${falha}`)
    return papel === 'implement' ? { arquivos: [], verificacao: { comando: '', passou: false }, falha_harness: falha } : null
  }
  return r
}

// --- scout --------------------------------------------------------------------------------

const ANGULOS = [
  { id: 'codigo', foco: 'onde isso mora no código hoje: arquivos, funções, quem chama, e os testes que cobrem' },
  { id: 'decisoes', foco: 'o que já foi decidido sobre isso: docs, ADR, CONTEXT.md, agent.md, commits recentes, cards' },
  { id: 'comportamento', foco: 'como se comporta hoje: o comando que roda, o teste, o log, a saída observável' },
]
const scout = (foco, label) => rodar('scout',
  `Tarefa que o reach vai decidir:\n${tarefa}\n\nBusque e junte, só lendo: ${foco}.\nCada achado com endereço (arquivo:linha, comando, link). O que não achar vai em lacunas.`,
  { label, phase: 'Scout', schema: ACHADOS })

const achados = []

// --- o painel: grilling e protótipo rodam num agente interativo num painel do Herdr ----------
// O Herdr abre um painel ao lado da sessão, com um Claude interativo: o usuário conversa com ele
// pela interface do próprio agente. O agente grava o contrato num arquivo, e o nó espera o arquivo
// enquanto o resto do grafo trabalha. Sem Herdr, ou sem arquivo em 45 min: o grafo pausa
// (estado perguntas) e a sessão pergunta pelo terminal.

const RESPOSTAS = {
  type: 'object',
  properties: {
    respostas: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, pergunta: { type: 'string' }, resposta: { type: 'string' }, opcao: { type: 'string' }, status: { type: 'string' } }, required: ['id', 'pergunta', 'resposta', 'status'] } },
    parcial: { type: 'boolean' },
  },
  required: ['respostas'],
}
let nPainel = 0
async function painel(nome, briefing, contrato, schema, phase, modelo = 'claude-opus-5-5') {
  const n = nPainel++
  const base = `$TMPDIR/orchestri-${nome}-${n}`
  // O nome do painel diz a função dele: Grilling · <rota> ou Protótipo · <ticket>.
  const rotulo = nome.replace(/^grill-/, 'Grilling · ').replace(/^proto-/, 'Protótipo · ').replace(/^to-map-/, 'Mapa · ').slice(0, 48)
  const r = await ag(
    `Você é a PONTE para um painel do Herdr. Não faça o trabalho do painel: só abra, entregue o briefing e espere o resultado. Leia ~/.agents/skills/herdr/SKILL.md antes.\n` +
    `1. test "$HERDR_ENV" = 1 — falhou: ok=false, motivo "fora do Herdr", e PARE.\n` +
    `2. Grave o briefing abaixo, inteiro, em "${base}.md". O resultado vai em "${base}.json" (apague esse arquivo se já existir).\n` +
    `3. herdr pane layout --current; abra um painel ao lado: herdr pane split --current --direction <right se o painel é largo, senão down> --cwd "${REPO ?? '$PWD'}" --no-focus. Guarde .result.pane.pane_id. Dê o nome ao painel: herdr pane rename <pane_id> "${rotulo}".\n` +
    `4. herdr agent start ${nome.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 24)}-${n} --kind claude --pane <pane_id> -- --model ${modelo} (agent_not_ready: espere com herdr agent wait até idle).\n` +
    `5. herdr agent prompt <agente> "Leia e siga ${base}.md. O usuário conversa com você neste painel." — sem --wait.\n` +
    `6. herdr notification, se existir, avisando o usuário que o painel "${nome}" espera por ele.\n` +
    `7. Espere o arquivo "${base}.json" em laços de até 8 min (until [ -f "${base}.json" ]; do sleep 15; done, com timeout; o Bash tem teto de 10 min). No máximo 45 min no total: passou, ok=false, motivo "sem resposta em 45 min".\n` +
    `8. Leia o JSON e devolva o conteúdo em resultado, sem mudar nada, com ok=true e o pane_id. Não feche o painel: o usuário decide.\n\n` +
    `--- BRIEFING ---\n${briefing}\n\nQuando terminar, grave em "${base}.json" um JSON neste formato, e só então diga ao usuário que ele pode voltar à sessão principal:\n${contrato}\n--- FIM ---`,
    { label: `painel:${nome}.${n}`, phase, model: 'haiku',
      schema: { type: 'object', properties: { ok: { type: 'boolean' }, motivo: { type: 'string' }, pane_id: { type: 'string' }, resultado: schema }, required: ['ok'] } })
  if (!r?.ok) { log(`painel ${nome}: ${r?.motivo ?? 'a ponte não respondeu'}`); return null }
  log(`painel ${nome}: respondido no painel ${r.pane_id ?? '?'}`)
  return r.resultado ?? null
}

// O grilling: as perguntas vão para um Claude num painel, que conduz a conversa com o usuário.
async function questionario(perguntas, rota) {
  const r = await painel(`grill-${rota}`,
    `Você conduz o GRILLING da orchestri (rota ${rota}) com o usuário, NESTE painel, pela sua própria interface. Siga ~/.agents/skills/grilling/SKILL.md e ~/.agents/skills/domain-modeling/SKILL.md.\n` +
    'Faça as perguntas abaixo, cada uma com a recomendação dela como primeira opção (AskUserQuestion, até 4 por vez, ou conversa quando a pergunta pede texto livre). ' +
    'Responda às dúvidas do usuário com o contexto das perguntas. Não crie perguntas novas: o que o usuário levantar de novo vai na resposta da pergunta mais próxima, como nuance. ' +
    'Pergunta que o usuário adiar: status deferred. Não escreva código, não mude arquivo além do JSON de saída.\n\n' +
    `PERGUNTAS:\n${texto(perguntas)}`,
    '{"respostas":[{"id":"q1","pergunta":"<o title>","resposta":"<a opção escolhida com o texto dela, ou o texto livre, com a nuance>","opcao":"<k da opção, se houver>","status":"answered|deferred"}]}',
    RESPOSTAS, 'Questionário')
  if (!r?.respostas?.length) return null
  const dadas = r.respostas.filter((x) => x.status === 'answered')
  respostas.push(...dadas.map((x) => ({ pergunta: x.pergunta, resposta: x.resposta, rota })))
  return dadas
}

// Perguntas e scouts saem JUNTOS: o painel do grilling espera o usuário enquanto os scouts buscam.
async function perguntarEBuscar(perguntas, buscas, rota) {
  const [dadas, novos] = await parallel([
    () => (perguntas?.length ? questionario(perguntas, rota) : Promise.resolve([])),
    () => (buscas?.length ? parallel(buscas.map((b) => () => scout(b.pergunta, b.label))) : Promise.resolve([])),
  ])
  achados.push(...(novos ?? []).filter(Boolean))
  return perguntas?.length && !dadas ? { pausa: perguntas } : { ok: true }
}

// Não aja antes de o usuário confirmar o entendimento (regra da skill grilling).
async function confirmar(entendimento, rota) {
  const q = [{ title: 'O entendimento está certo?', body: `Antes da spec. O ${rota} fechou assim:\n\n${entendimento.resumo}` +
    (entendimento.destino ? `\n\nDestino: ${entendimento.destino}` : ''),
    options: [{ k: 'A', text: 'Sim, pode escrever a spec' }, { k: 'B', text: 'Não — corrijo no texto da resposta' }],
    rec: { option: 'A', why: 'Confirme só se o resumo diz o que você quer; o que estiver errado vira correção.' } }]
  const dadas = await questionario(q, rota)
  if (!dadas) return { pausa: q }
  const r = dadas[0]
  return /^\s*(A\b|sim)/i.test(r?.opcao ?? r?.resposta ?? '') ? { ok: true } : { corrigir: r?.resposta ?? '' }
}

// --- ondas: dependência e arquivos exclusivos decididos em código --------------------------

function ondas(tickets) {
  const ids = new Set(tickets.map((t) => t.id))
  const feitos = new Set()
  const resto = [...tickets]
  const out = []
  while (resto.length) {
    const prontos = resto.filter((t) => (t.depende_de ?? []).every((d) => !ids.has(d) || feitos.has(d)))
    if (!prontos.length) throw new Error(`dependência circular entre tickets: ${resto.map((t) => t.id).join(', ')}`)
    const onda = []
    const tocados = new Set()
    for (const t of prontos) {
      if (t.arquivos.some((a) => tocados.has(a))) continue   // disputa arquivo: vai para a onda seguinte
      t.arquivos.forEach((a) => tocados.add(a))
      onda.push(t)
    }
    onda.forEach((t) => { feitos.add(t.id); resto.splice(resto.indexOf(t), 1) })
    out.push(onda)
  }
  return out
}

// --- um ticket: implement ↔ seu monitoring, até MAX_VOLTAS_TICKET --------------------------

async function ticket(spec, t, faltouInicial, passada) {
  const p = passada ? `p${passada}.` : ''
  let faltou = faltouInicial ?? null
  // O par ativo. Se o Grok falhar na hora (erro, cota), o ticket troca para a reserva: Sol constrói, Fable confere.
  let par = { implement: undefined, monitoring: undefined, tag: '' }
  for (let volta = 0; ; volta++) {
    const imp = await rodar('implement',
      `Tarefa: ${spec.objetivo}\n\nSeu ticket:\n${texto(t)}\n\n` +
      (faltou ? `O monitoring reprovou a entrega anterior. Falta:\n${texto(faltou)}\n\n` : '') +
      `Arquivos EXCLUSIVOS deste ticket: ${t.arquivos.join(', ')}. Outros implements rodam em paralelo nos outros arquivos — não toque neles.\n` +
      'Construa com as skills do implement (implement, tdd). Teste primeiro quando a fatia muda comportamento. ' +
      'Rode a verificação do projeto e devolva o comando e se passou. Ticket com lacuna: devolva a lacuna, sem decidir.',
      { label: `implement:${t.id}.${p}${volta}${par.tag}`, phase: 'Implement', schema: IMPLEMENT, candidato: par.implement })
    if ((!imp || imp.falha_harness) && !par.implement && plano.reserva) {
      par = { ...plano.reserva, tag: ':reserva' }
      log(`${t.id}: o implement ${plano.papeis.implement.modelo} falhou (${imp?.falha_harness ?? 'sem resposta'}) — reserva: ${par.implement.modelo} constrói, ${par.monitoring.modelo} confere`)
      volta--
      continue
    }
    if (!imp) return { id: t.id, estado: 'humano', motivo: 'o implement não respondeu' }
    if (imp.falha_harness) return { id: t.id, estado: 'humano', motivo: `o implement falhou: ${imp.falha_harness}` }
    decididoSozinho.push(...(imp.decisoes ?? []).map((d) => `${t.id}: ${d}`))
    if (imp.lacuna) return { id: t.id, estado: 'lacuna', lacuna: imp.lacuna }

    const mon = await rodar('monitoring',
      `Ticket:\n${texto(t)}\n\nO implement diz que mudou:\n${texto(imp.arquivos)}\ne rodou:\n${texto(imp.verificacao)}\n\n` +
      `Confira pelo DIFF dos arquivos do ticket (git diff -- ${t.arquivos.join(' ')}), não pelo relato; arquivo NOVO não aparece no diff — veja \`git status --short\` e leia os não rastreados. ` +
      'Rode a verificação DO TICKET (os testes dos arquivos dele), não a suíte inteira: outros implements da mesma onda podem estar escrevendo. A suíte inteira roda no fim, para o Jev. ' +
      'Rode a skill code-review sobre o diff do ticket, nos dois eixos dela: Standards (o código segue os padrões documentados do repositório?) e Spec (o diff faz o que o ticket pede?). Sem subagentes à mão, rode os dois eixos em sequência. Registre os achados em code_review, e bloqueia=true se algum achado impede o merge. ' +
      'Julgue cada critério de pronto do ticket com evidência. Veredito: passou (só com code-review sem bloqueio) · refaz (com o que falta, objetivo — inclui os achados que bloqueiam) · humano (ambíguo, decisão de produto).',
      { label: `monitoring:${t.id}.${p}${volta}${par.tag}`, phase: 'Monitoring', schema: MONITORING, candidato: par.monitoring })
    if (!mon) return { id: t.id, estado: 'humano', motivo: 'o monitoring não respondeu' }
    // O code-review que bloqueia vence o veredito: passou com bloqueio vira refaz.
    if (mon.veredito === 'passou' && mon.code_review?.bloqueia) { mon.veredito = 'refaz'; mon.faltou = [...(mon.faltou ?? []), ...(mon.code_review.standards ?? []), ...(mon.code_review.spec ?? [])]; mon.motivo = `code-review bloqueia: ${mon.motivo}` }
    if (mon.veredito === 'passou') return { id: t.id, estado: 'passou', arquivos: imp.arquivos, verificacao: imp.verificacao, voltas: volta, code_review: mon.code_review }
    if (mon.veredito === 'humano') return { id: t.id, estado: 'humano', motivo: mon.motivo }
    if (volta >= MAX_VOLTAS_TICKET) return { id: t.id, estado: 'humano', motivo: `refaz depois de ${MAX_VOLTAS_TICKET} voltas: ${mon.motivo}`, faltou: mon.faltou }
    faltou = mon.faltou ?? [mon.motivo]
    log(`${t.id}: refaz (${volta + 1}/${MAX_VOLTAS_TICKET}) — ${mon.motivo}`)
  }
}

// --- a porta: o Jev decidiu antes do grafo (args.grande) — to-map + Fable, ou grilling + Opus ---
// Sem as respostas do usuário nos prompts de varredura: na retomada, os scouts voltam do cache.

const escalada = plano.papeis.reach.escalada
let grande = args?.grande
if (grande === undefined) {
  phase('Porta')
  const c = (id, custo, quando) => ({ id, tarefa, entrega: 'o caminho do grafo', modelo: id === 'grande' ? 'Fable 5.1' : 'Opus 5.5', esforco: 'high', custo_relativo: custo, quando })
  const rota = { pedido: tarefa, frente_principal: 'coordenar o grafo', candidatos: [
    c('pequena', 3, 'cabe numa sessão, o caminho é visível; grilling e spec no Opus'),
    c('grande', 4, 'não cabe numa sessão, ou tem névoa, ou errar não tem Ctrl+Z; to-map no Fable'),
  ].map(({ quando, ...x }) => ({ ...x, tarefa: `${tarefa} — ${quando}` })) }
  const j = await ag(
    'Grave o JSON abaixo em "$TMPDIR/orchestri-rota.json" e rode: node ~/.agents/skills/decision-gate/scripts/rotear.mjs --input "$TMPDIR/orchestri-rota.json"\n' +
    'Devolva o exit code e, do JSON do stdout, "probabilidades" e "confianca". Não interprete.\n\n' + texto(rota),
    { label: 'jev:porta', phase: 'Porta', model: 'haiku',
      schema: { type: 'object', properties: { exit: { type: 'integer' }, probabilidades: { type: 'object', properties: { pequena: { type: 'number' }, grande: { type: 'number' }, principal: { type: 'number' } } }, confianca: { type: 'number' } }, required: ['exit'] } })
  linhas.push({ frente: 'jev:porta', papel: 'juiz', harness: 'decision-gate', modelo: 'typesafe/jev' })
  // Classificador, não porteiro: vale a maior probabilidade ≥ 0,60; sem isso, grande — o to-map sem névoa desce sozinho.
  const pr = j?.exit === 0 ? j.probabilidades ?? {} : {}
  grande = !((pr.pequena ?? 0) >= 0.6 && (pr.pequena ?? 0) > (pr.grande ?? 0))
  log(`porta do Jev: ${j?.exit === 0 ? `pequena ${pr.pequena ?? '?'} · grande ${pr.grande ?? '?'}` : 'o Jev não decidiu'} → ${grande ? 'grande' : 'pequena'}`)
}
grande = !!grande
let modeloReach, tagReach
const ajustarReach = () => { modeloReach = grande && escalada ? escalada : undefined; tagReach = modeloReach ? ':fable' : '' }
ajustarReach()
log(`porta do Jev: ${grande ? 'grande → to-map' : 'pequena → grilling'}${modeloReach ? `, reach em ${escalada}` : ''}`)

let entendimento = null
let rota = grande ? 'to-map' : 'grilling'
for (let volta = 0; volta < 2 && !entendimento; volta++) {
  if (grande) {
    // to-map ORIGINAL (a wayfinder), como ela é, num painel do Herdr com o usuário. O mapa vive no tracker e
    // cresce em CAMADAS: cada ticket resolvido fecha e entra em Decisions so far, a névoa que ficou nítida vira
    // ticket, o que passou do destino sai do escopo. O destino não muda (mudou = esforço novo) e o mapa nunca é
    // refeito. Um ticket por sessão, como a skill manda; o grafo só abre a sessão seguinte e acompanha.
    phase('Mapa')
    const TO_MAP = '~/.agents/skills/to-map/SKILL.md'
    const TRACKER = 'o tracker deste repositório (a doc de issue tracker do repo diz qual e como; aqui é o Multica)'
    const modeloMapa = escalada ?? 'claude-fable-5-1'
    let mapa = args?.mapa ?? null
    if (!mapa) {
      const c = await painel('to-map-traçar',
        `Rode a skill to-map (${TO_MAP}) COMO ELA É, no modo "Chart the map", com o usuário NESTE painel. Ela não se invoca pela ferramenta Skill: leia o SKILL.md e siga.\n` +
        `A ideia que chegou:\n${tarefa}\n\nO mapa e os tickets vão para ${TRACKER}. Pare ao fim do charting, como a skill manda.`,
        '{"mapa":"<url ou id do mapa no tracker>","destino":"<o destino>","sem_nevoa":false}',
        { type: 'object', properties: { mapa: { type: 'string' }, destino: { type: 'string' }, sem_nevoa: { type: 'boolean' } } },
        'Mapa', modeloMapa)
      linhas.push({ frente: 'to-map:traçar', papel: 'reach', harness: 'claude', modelo: modeloMapa })
      if (!c) return fim('humano', { motivo: 'o painel do to-map não voltou: rode /to-map e retome com args.mapa' })
      if (c.sem_nevoa) { grande = false; ajustarReach(); rota = 'grilling'; log('to-map: sem névoa — segue pelo grilling') }
      else if (!c.mapa) return fim('humano', { motivo: 'o to-map não devolveu o mapa' })
      else { mapa = c.mapa; mapas.push({ onde: 'traçado', mapa, destino: c.destino }); log(`mapa traçado: ${mapa} — destino: ${c.destino ?? '?'}`) }
    }
    for (let t = 0; grande && t < MAX_TICKETS_MAPA && !entendimento; t++) {
      const w = await painel(`to-map-ticket ${t + 1}`,
        `Rode a skill to-map (${TO_MAP}) COMO ELA É, no modo "Work through the map", sobre o mapa ${mapa} em ${TRACKER}, com o usuário NESTE painel. ` +
        'UM ticket nesta sessão (a skill deixa pesquisa em paralelo). Registre a resolução como a skill manda: comentário, fechar, Decisions so far, tickets novos, névoa graduada, fora do escopo. Não refaça o mapa.',
        '{"ticket":"<nome do ticket>","resposta":"<o gist da resolução>","abertos":<tickets abertos no mapa>,"destino_claro":<true quando nada resta decidir>,"destino":"<o destino>","resumo":"<Decisions so far, em linhas>"}',
        { type: 'object', properties: { ticket: { type: 'string' }, resposta: { type: 'string' }, abertos: { type: 'integer' }, destino_claro: { type: 'boolean' }, destino: { type: 'string' }, resumo: { type: 'string' } }, required: ['abertos', 'destino_claro'] },
        'Mapa', modeloMapa)
      linhas.push({ frente: `to-map:ticket ${t + 1}`, papel: 'reach', harness: 'claude', modelo: modeloMapa })
      if (!w) return fim('humano', { motivo: `o painel do to-map não voltou no ticket ${t + 1}: siga com /to-map ${mapa} e retome com args.mapa`, mapa })
      mapas.push({ onde: `ticket ${t + 1}`, mapa, ticket: w.ticket, resposta: w.resposta, abertos: w.abertos })
      log(`mapa ${mapa}: ticket ${t + 1} "${w.ticket ?? '?'}" — ${w.resposta ?? ''} · ${w.abertos} aberto(s)`)
      if (w.destino_claro || w.abertos === 0) entendimento = { mapa, destino: w.destino, resumo: w.resumo ?? '' }
    }
    if (grande && !entendimento) return fim('humano', { motivo: `o mapa ${mapa} não fechou em ${MAX_TICKETS_MAPA} tickets: siga com /to-map e retome com args.mapa`, mapa })
    if (entendimento) break
  }

  // pequena: scouts em ângulos fixos, depois o grilling
  if (!achados.length) {
    phase('Scout')
    achados.push(...(await parallel(ANGULOS.map((a) => () => scout(a.foco, `scout:${a.id}`)))).filter(Boolean))
    if (!achados.length) return fim('humano', { motivo: 'nenhum scout voltou' })
    log(`scouts: ${achados.reduce((n, a) => n + a.achados.length, 0)} achados`)
  }
  for (let pedidos = 0; pedidos <= 4 && !entendimento; pedidos++) {
    phase('Grilling')
    const d = await rodar('reach',
      `Tarefa:\n${tarefa}\n\nO que os scouts juntaram:\n${texto(achados)}\n\n` +
      `Respostas do usuário até aqui:\n${respostasDescoberta().length ? texto(respostasDescoberta()) : '(nenhuma)'}\n\n` +
      'Rode as skills grilling e domain-modeling sobre a tarefa: o que precisa estar decidido antes da spec, e o vocabulário do domínio. Não pergunte o que os achados já respondem. Uma rodada = a fronteira inteira. ' +
      'Devolva perguntas (cada uma com title, body, options e a sua recomendação) e/ou mais_fatos (o que um scout precisa buscar) — os dois saem juntos —, ou nenhum dos dois e o resumo do que ficou decidido. ' +
      'Se a tarefa não cabe numa sessão ou tem névoa que só um mapa resolve, marque precisa_mapa=true, com o motivo. ' +
      'Toda decisão ainda aberta vira PERGUNTA, mesmo quando você tem recomendação — a recomendação vai na pergunta; o resumo só leva o que já está decidido. Regra de NEGÓCIO sem resposta (dinheiro, prazo, regra para o cliente) nunca vira suposição. Liste em suposicoes o que assumiu.',
      { label: `reach:grilling.${volta}.${pedidos}`, phase: 'Grilling', schema: DESCOBERTA })
    if (!d) return fim('humano', { motivo: 'o reach não respondeu no grilling' })
    decididoSozinho.push(...(d.suposicoes ?? []))
    if (d.precisa_mapa && volta === 0) {
      grande = true; ajustarReach(); rota = 'to-map'
      log(`grilling: precisa de mapa — sobe para o to-map: ${d.motivo_mapa ?? ''}`)
      break
    }
    if (d.perguntas?.length || d.mais_fatos?.length) {
      const r = await perguntarEBuscar(d.perguntas, (d.mais_fatos ?? []).map((f, i) => ({ pergunta: f, label: `scout:grilling${pedidos}.${i}` })), 'grilling')
      if (r.pausa) return fim('perguntas', { perguntas: r.pausa, rota: 'grilling' })
      continue
    }
    const c = await confirmar(d, 'grilling')
    if (c.pausa) return fim('perguntas', { perguntas: c.pausa, rota: 'grilling' })
    if (c.corrigir !== undefined) { log('grilling: o usuário corrigiu o entendimento'); continue }
    entendimento = d
  }
  if (!entendimento && !grande) return fim('humano', { motivo: 'o grilling rodou cinco vezes sem fechar' })
}
if (!entendimento) return fim('humano', { motivo: 'a porta trocou de caminho duas vezes sem fechar' })

// --- o Jev e o adversarial, reaproveitados pelo loop e pelo gauntlet --------------------------

async function julgar(spec, label, critico) {
  phase('Jev')
  const j = await ag(
    'Você é a PONTE para o juiz (o Jev, skill decision-gate). Não julgue você mesmo.\n' +
    '1. Grave a spec abaixo em "$TMPDIR/orchestri-spec.md".\n' +
    '2. Grave o diff COMPLETO em "$TMPDIR/orchestri-diff.txt", com os arquivos novos: ' +
    '`{ git diff HEAD; git ls-files --others --exclude-standard | while read f; do git diff --no-index /dev/null "$f"; done; } > "$TMPDIR/orchestri-diff.txt"`. Não mexa no índice do git.\n' +
    '3. Rode a verificação do projeto (`npm run verificar` se existir; senão o comando de teste do projeto) e grave a saída em "$TMPDIR/orchestri-verificar.txt". ' +
    'O Bash tem teto de 10 min por chamada: comando longo roda em background e você acompanha até terminar.\n' +
    '4. Rode: `node ~/.agents/skills/decision-gate/scripts/juiz.mjs --gate --spec-arquivo "$TMPDIR/orchestri-spec.md" ' +
    `--diff-arquivo "$TMPDIR/orchestri-diff.txt" --verificar-saida "$TMPDIR/orchestri-verificar.txt"${critico ? ' --critico' : ''}\`.\n` +
    '5. Devolva o EXIT CODE do juiz (0 passou · 2 refaz · 3 humano · 1 erro), a confiança do JSON do stdout, a linha do stderr, e o resumo da verificação.\n\n' +
    `--- SPEC ---\n${texto({ tarefa, ...spec })}\n--- FIM ---`,
    { model: 'haiku', label, phase: 'Jev', schema: JUIZ })
  linhas.push({ frente: label, papel: 'juiz', harness: 'decision-gate', modelo: 'typesafe/jev' })
  if (!j) return { veredito: 'erro', linha: 'a ponte do Jev não respondeu' }
  return { veredito: { 0: 'passou', 2: 'refaz', 3: 'humano' }[j.exit] ?? 'erro', confianca: j.confianca ?? null, linha: j.stderr ?? '', verificacao: j.verificacao }
}

// A régua do gauntlet adversarial, fixada antes do ataque: N sessões × P passos, zero defeito.
const REGUA = { sessoes: 4, passos: 20, defeitos: 0 }
const MAX_GAUNTLET = 3   // voltas de correção antes de chamar o humano
const TELA = /\.(tsx|jsx|vue|svelte|html|css|scss)$|(^|\/)(pages|components|client|app\/routes|views)\//i

async function atacar(arquivos, label) {
  phase('Adversarial')
  const r = await ag(
    'Rode o teste ADVERSARIAL do projeto: o crítico duro e cego do gauntlet — ele ataca a tela sem ver o diff. Não escreva código nem conserte nada.\n' +
    `Régua: ${REGUA.sessoes} sessões × ${REGUA.passos} passos, ${REGUA.defeitos} defeito.\nArquivos entregues:\n${texto(arquivos)}\n\n` +
    '1. Confira se o package.json da raiz tem o script "adversarial". Sem ele: tem_adversarial=false e pare.\n' +
    '2. Suba a app local que o adversarial usa (no monorepo MenosJuros: npm run dev, que sobe CRM e API locais; espere o CRM responder), se ainda não estiver no ar. Background; o Bash tem teto de 10 min por chamada.\n' +
    `3. Rode: npm run adversarial -- --sessoes ${REGUA.sessoes} --passos ${REGUA.passos} (o alvo padrão é o CRM local; ele recusa qualquer outro host). Espere terminar.\n` +
    '4. Devolva o EXIT CODE real (0 nenhum defeito · 2 defeitos · 1 erro), o caminho do relatorio.md, e cada defeito (tela, o que quebrou, o caminho de cliques). Ambiente que não sobe ou login do .env.harness ausente: exit 1 e a mensagem exata.',
    { label, phase: 'Adversarial', model: 'sonnet',
      schema: { type: 'object', properties: { tem_adversarial: { type: 'boolean' }, exit: { type: 'integer' }, relatorio: { type: 'string' }, defeitos: { type: 'array', items: { type: 'object', properties: { tela: { type: 'string' }, quebrou: { type: 'string' }, caminho: { type: 'string' } }, required: ['quebrou'] } }, mensagem: { type: 'string' } }, required: ['tem_adversarial'] } })
  linhas.push({ frente: label, papel: 'monitoring', harness: 'claude + Jev', modelo: 'typesafe/jev' })
  return r
}

// --- o loop: to-spec → to-tickets → implement(s) → monitoring(s) → final, até fechar ------

let lacuna = null
const entregues = {}
for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
  let decisao = null
  for (let pedidos = 0; pedidos <= 2 && !decisao; pedidos++) {
    phase('Spec')
    const r = await rodar('reach',
      `Tarefa:\n${tarefa}\n\nO que os scouts juntaram:\n${texto(achados)}\n\n` +
      `O que o ${rota} deixou decidido:\n${texto(entendimento)}\n\n` +
      `Respostas do usuário:\n${respostas.length ? texto(respostas) : '(nenhuma)'}\n\n` +
      (Object.keys(entregues).length ? `Já entregue e aprovado nas rodadas anteriores:\n${texto(entregues)}\nEspecifique só o que falta.\n\n` : '') +
      (lacuna ? `A rodada anterior parou numa lacuna de spec: ${lacuna}\n\n` : '') +
      'Não decida o harness nem o modelo de quem constrói ou confere — isso é do plano, em código; falha de runner não é lacuna de spec. Siga o método da skill to-spec lendo ~/.agents/skills/to-spec/SKILL.md (ela não se invoca pela ferramenta Skill): objetivo, critério de pronto verificável da tarefa inteira, o que muda e onde, fora do escopo. Devolva UM estado:\n' +
      '- "spec": a spec fechada;\n- "perguntas": o que só o usuário responde, com a sua recomendação;\n- "mais_fatos": o que um scout precisa buscar.\n' +
      'Marque critico=true pelo TEMA (dinheiro, crédito, cadastro, auth, dado sensível). Liste em suposicoes o que assumiu.',
      { label: `reach:to-spec.${rodada}.${pedidos}${tagReach}`, phase: 'Spec', schema: SPEC, modelo: modeloReach })
    if (!r) return fim('humano', { motivo: 'o reach não respondeu no to-spec' })
    decididoSozinho.push(...(r.suposicoes ?? []))
    if (r.estado === 'perguntas' && r.perguntas?.length) {
      const q = await perguntarEBuscar(r.perguntas, [], 'to-spec')
      if (q.pausa) return fim('perguntas', { perguntas: q.pausa, rota: 'to-spec', entregues })
      continue
    }
    if (r.estado === 'mais_fatos' && r.mais_fatos?.length) {
      phase('Scout')
      achados.push(...(await parallel(r.mais_fatos.map((f, i) => () => scout(f, `scout:spec${rodada}.${pedidos}.${i}`)))).filter(Boolean))
      continue
    }
    if (r.estado !== 'spec' || !r.spec) return fim('humano', { motivo: 'o to-spec não fechou a spec', resposta: r })
    decisao = r
  }
  if (!decisao) return fim('humano', { motivo: 'o to-spec pediu fatos três vezes sem fechar' })
  if ((decisao.critico || temaCritico) && !args?.autorizar_critico) {
    return fim('critico', { spec: decisao.spec, motivo: `fluxo crítico${temaCritico ? ' (pelo tema da tarefa)' : ''}: a construção espera a autorização do usuário` })
  }

  phase('Tickets')
  const tk = await rodar('reach',
    `Spec fechada:\n${texto(decisao.spec)}\n\n` +
    (rota === 'to-map' ? `O mapa (to-map) está no tracker: ${entendimento.mapa}. Leia o mapa e os tickets fechados (as decisões moram neles):\n${texto(entendimento)}\n\n` : '') +
    'Não decida o harness nem o modelo de quem constrói ou confere — isso é do plano, em código; falha de runner não é lacuna de spec. Siga o método da skill to-tickets lendo ~/.agents/skills/to-tickets/SKILL.md (ela não se invoca pela ferramenta Skill): quebre a spec em tickets verticais, cada um com arquivos EXCLUSIVOS (dois tickets nunca escrevem o mesmo arquivo), ' +
    'critério de pronto verificável e depende_de. Não publique no tracker: devolva os tickets.',
    { label: `reach:to-tickets.${rodada}${tagReach}`, phase: 'Tickets', schema: TICKETS, modelo: modeloReach })
  if (!tk?.tickets?.length) return fim('humano', { motivo: 'o to-tickets não devolveu tickets', spec: decisao.spec })
  // A partir da 2ª rodada, o id leva a rodada: ticket novo não sobrescreve o que já foi entregue.
  const ns = (id) => (rodada ? `r${rodada}-${id}` : id)
  const spec = { ...decisao.spec, tickets: tk.tickets.map((t) => ({ ...t, id: ns(t.id), depende_de: (t.depende_de ?? []).map(ns) })) }

  let plan
  try { plan = ondas(spec.tickets) } catch (e) { return fim('humano', { motivo: e.message, spec }) }
  log(`${spec.tickets.length} tickets em ${plan.length} onda(s)`)

  // implements em paralelo por onda; cada um com seu monitoring, sem barreira entre os dois
  lacuna = null
  for (const onda of plan) {
    phase('Implement')
    const res = await parallel(onda.map((t) => () => ticket(spec, t, null, 0)))
    const caiu = onda.filter((t, i) => !res[i])
    if (caiu.length) return fim('humano', { motivo: `ticket sem resposta (erro ou pulado): ${caiu.map((t) => t.id).join(', ')}`, spec, entregues })
    for (const r of res) {
      if (r.estado === 'passou') entregues[r.id] = { arquivos: r.arquivos, verificacao: r.verificacao }
      else if (r.estado === 'lacuna') lacuna = `${r.id}: ${r.lacuna}`
      else return fim('humano', { motivo: `${r.id}: ${r.motivo}`, spec, entregues, faltou: r.faltou })
    }
    if (lacuna) break
  }

  // o Jev julga o todo: spec + diff completo + verificação. O veredito sai do exit code, em código.
  if (!lacuna) {
    const critico = decisao.critico || temaCritico
    let jev = await julgar(spec, `jev:${rodada}`, critico)
    if (jev.veredito === 'erro') return fim('humano', { motivo: `o Jev não julgou: ${jev.linha || 'sem stderr'} — o trabalho não foi julgado`, spec, entregues, jev })
    if (jev.veredito === 'humano') return fim('humano', { motivo: `o Jev pediu humano: ${jev.linha}`, spec, entregues, jev })
    if (jev.veredito === 'refaz') {
      // refaz: o Jev não lista o que falta — o to-spec relê a spec, o entregue e a verificação
      lacuna = `o Jev devolveu refaz (confiança ${jev.confianca ?? '?'}): ${jev.linha}. Verificação: ${texto(jev.verificacao ?? {})}`
    } else {
      // O que o PR leva: só os arquivos que os tickets entregaram, nunca mudança alheia do working tree.
      const doEntregue = () => [...new Set(Object.values(entregues).flatMap((e) => e.arquivos ?? []))]
      let arquivos = doEntregue()
      const tocaTela = arquivos.some((a) => TELA.test(a))
      let e2e = { rodou: false, motivo: 'nenhum ticket toca tela' }

      // GAUNTLET ADVERSARIAL: a régua é fixada antes; o adversarial é o crítico duro e cego (ataca a tela
      // sem ver o diff); defeito vira ticket de correção, e o grafo volta até bater a régua ou estourar o teto.
      if (tocaTela) {
        for (let g = 0; ; g++) {
          const r = await atacar(arquivos, `adversarial:${rodada}.${g}`)
          if (!r) return fim('humano', { motivo: 'o nó adversarial não respondeu', spec, entregues, jev })
          if (!r.tem_adversarial) { e2e = { rodou: false, motivo: 'o projeto não tem npm run adversarial' }; log('adversarial: o projeto não tem o script — PR segue, e a conferência diz isso'); break }
          if (r.exit === 0) { e2e = { rodou: true, regua: REGUA, voltas: g, relatorio: r.relatorio }; log(`adversarial: régua batida na volta ${g} — ${r.relatorio ?? ''}`); break }
          if (r.exit !== 2) return fim('humano', { motivo: `adversarial não rodou: ${r.mensagem ?? `exit ${r.exit}`}`, spec, entregues, jev })
          if (g >= MAX_GAUNTLET) return fim('humano', { motivo: `o adversarial ainda acha defeito depois de ${MAX_GAUNTLET} voltas de correção — régua não batida`, defeitos: r.defeitos, relatorio: r.relatorio, spec, entregues, jev })
          log(`adversarial: ${r.defeitos?.length ?? '?'} defeito(s) — volta ${g + 1} de correção`)

          // o reach transforma os defeitos em tickets de correção (arquivos exclusivos, critério = o caminho não quebra mais)
          phase('Tickets')
          const tk = await rodar('reach',
            `Spec:\n${texto(spec)}\n\nO teste adversarial quebrou a tela. Relatório: ${r.relatorio ?? '(sem)'}\nDefeitos:\n${texto(r.defeitos ?? [])}\n\n` +
            'Siga o método da skill to-tickets lendo ~/.agents/skills/to-tickets/SKILL.md (ela não se invoca pela ferramenta Skill): um ticket de correção por defeito (ou por causa comum), com arquivos EXCLUSIVOS e critério de pronto verificável — o caminho de cliques que quebrou passa a funcionar, sem erro de console nem 5xx. ' +
            'Não decida o harness nem o modelo de quem constrói. Não publique no tracker: devolva os tickets.',
            { label: `reach:correcoes.${rodada}.${g}${tagReach}`, phase: 'Tickets', schema: TICKETS, modelo: modeloReach })
          if (!tk?.tickets?.length) return fim('humano', { motivo: 'o reach não transformou os defeitos em tickets', defeitos: r.defeitos, spec, entregues, jev })
          const ns = (id) => `g${rodada}.${g + 1}-${id}`
          const correcoes = tk.tickets.map((t) => ({ ...t, id: ns(t.id), depende_de: (t.depende_de ?? []).map(ns) }))
          let planC
          try { planC = ondas(correcoes) } catch (e) { return fim('humano', { motivo: e.message, spec, entregues, jev }) }
          for (const onda of planC) {
            phase('Implement')
            const res = await parallel(onda.map((t) => () => ticket(spec, t, null, 0)))
            const caiu = onda.filter((t, i) => !res[i])
            if (caiu.length) return fim('humano', { motivo: `correção sem resposta: ${caiu.map((t) => t.id).join(', ')}`, spec, entregues })
            for (const x of res) {
              if (x.estado === 'passou') entregues[x.id] = { arquivos: x.arquivos, verificacao: x.verificacao }
              else if (x.estado === 'lacuna') lacuna = `${x.id}: ${x.lacuna}`
              else return fim('humano', { motivo: `${x.id}: ${x.motivo}`, spec, entregues, faltou: x.faltou })
            }
            if (lacuna) break
          }
          if (lacuna) break
          arquivos = doEntregue()
          // a correção passa pelo Jev de novo antes do próximo ataque
          jev = await julgar({ ...spec, tickets: [...spec.tickets, ...correcoes] }, `jev:${rodada}.g${g + 1}`, critico)
          if (jev.veredito === 'erro') return fim('humano', { motivo: `o Jev não julgou a correção: ${jev.linha}`, spec, entregues, jev })
          if (jev.veredito === 'humano') return fim('humano', { motivo: `o Jev pediu humano na correção: ${jev.linha}`, spec, entregues, jev })
          if (jev.veredito === 'refaz') { lacuna = `o Jev devolveu refaz na correção do adversarial: ${jev.linha}`; break }
        }
      } else log('adversarial: pulado — nenhum ticket toca tela')

      if (!lacuna) {
        // Passou pelo Jev (e pela régua do adversarial, quando toca tela): o PR abre dentro do grafo. O merge é humano.
        phase('PR')
        const conferencia = { tarefa, criterio_pronto: spec.criterio_pronto, tickets: spec.tickets.map((t) => t.id + ': ' + t.objetivo), jev, e2e, decidido_sozinho: decididoSozinho, frentes: linhas }
        const pr = await ag(
          'O Jev passou. Abra o PR, nesta ordem, sem pular nada:\n' +
          '1. Branch: na main (ou no branch padrão), crie orchestri/<slug curto da tarefa>; num branch de trabalho, fique nele.\n' +
          `2. git add SÓ estes arquivos, um por um (nunca -A): ${arquivos.join(' ')}. Confira com git diff --cached --stat que nada alheio entrou.\n` +
          '3. Commit: "feat|fix(<escopo>): <a tarefa>", com os tickets no corpo e as linhas de atribuição da sessão.\n' +
          '4. git push -u origin <branch> e gh pr create --base <branch padrão>, com o corpo abaixo em Markdown (tarefa, critérios, tickets, veredito do Jev, adversarial, decidido sozinho, frentes) e a linha de atribuição de PR.\n' +
          '5. NÃO mergeie, não ative auto-merge, não aprove. Sem gh autenticado ou sem remoto: faça o commit e devolva o comando do PR em "erro".\n' +
          '6. Depois do commit, rode git status --short e liste em "fora" tudo que ficou fora do PR (não rastreado ou alterado e alheio, ex.: graft/.cache). NÃO apague nem adicione nada disso; só avise — e ponha a lista numa seção "Fora deste PR" no corpo, quando houver.\n\n' +
          `CONFERÊNCIA:\n${texto(conferencia)}`,
          { label: 'pr', phase: 'PR', model: 'sonnet',
            schema: { type: 'object', properties: { url: { type: 'string' }, branch: { type: 'string' }, commit: { type: 'string' }, erro: { type: 'string' }, fora: { type: 'array', items: { type: 'string' } } }, required: ['branch'] } })
        if (pr?.fora?.length) log(`fora do PR (não apagado): ${pr.fora.join(', ')}`)
        return fim('passou', { spec, entregues, arquivos, jev, e2e, pr, rodadas: rodada + 1 })
      }
    }
  }
  log(`volta ao to-spec: ${lacuna}`)
}
return fim('humano', { motivo: `${MAX_RODADAS} rodadas sem fechar a tarefa`, entregues, lacuna })
