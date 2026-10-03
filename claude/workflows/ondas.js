export const meta = {
  name: 'ondas',
  description: 'Tickets em ondas pela dependência: um laco-de-refaz por ticket, em paralelo dentro da onda, e um fechamento sobre o todo (verificação inteira e Jev).',
  whenToUse: 'Tickets da to-tickets prontos para construir. args: { tickets, spec, critico?, autorizar_critico? }. Só a sessão chama (ele já chama o laco-de-refaz; o runtime permite um nível). Não commita nem abre PR.',
  phases: [
    { title: 'Ondas', detail: 'um laco-de-refaz por ticket, por onda' },
    { title: 'Fechamento', detail: 'um monitoring sobre a união: verificação inteira e Jev' },
  ],
}

const TEMA_CRITICO = /cr[eé]dito|parcela|pagamento|d[eé]bito|cobran[çc]a|juros|cadastro|autentica|login|senha|\bcpf\b|\bcnpj\b|open finance|proposta/i
const MONITORING = {
  type: 'object',
  properties: {
    jev: {
      type: 'object',
      properties: {
        exit: { type: 'integer' }, veredito: { type: 'string' }, confianca: { type: 'number' }, critico: { type: 'boolean' },
        probabilidades: { type: 'object', additionalProperties: { type: 'number' } }, linha: { type: 'string' },
      },
    },
    verificacao: { type: 'object', properties: { comando: { type: 'string' }, passou: { type: 'boolean' }, saida: { type: 'string' } } },
    code_review: { type: 'object', properties: { bloqueia: { type: 'boolean' }, standards: { type: 'array', items: { type: 'string' } }, spec: { type: 'array', items: { type: 'string' } } }, required: ['bloqueia'] },
    criterios: { type: 'array', items: { type: 'object', properties: { criterio: { type: 'string' }, atende: { type: 'boolean' }, evidencia: { type: 'string' } }, required: ['criterio', 'atende'] } },
    faltou: { type: 'array', items: { type: 'string' } },
  },
  required: ['jev', 'code_review', 'criterios'],
}
const PROXIMO = {
  passou: 'revise o diff da união dos arquivos; commit e PR são da sessão, sob o gate humano',
  revisao_humana: 'há ticket crítico: o humano confere o diff antes de seguir',
  refaz: 'o fechamento reprovou a soma: leve faltou ao reach, não há ticket a quem devolver',
  humano: 'leve motivo, tickets e pendentes ao usuário',
  lacuna: 'leve as lacunas ao reach; com a spec corrigida, rode de novo',
  critico: 'pergunte ao usuário sobre os críticos; autorizado, rode de novo com autorizar_critico: true',
  invalido: 'corrija os args (motivos)',
}

const texto = (o) => JSON.stringify(o, null, 2)
const lista = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x)
const norm = (p) => String(p).replace(/^(\.\/)+/, '').replace(/\/+$/, '')
const disputa = (x, y) => x.arquivos.some((p) => y.arquivos.some((q) => {
  const a = norm(p), b = norm(q)
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/')
}))
const critico = (t) => a.critico === true ||
  TEMA_CRITICO.test(`${t.objetivo} ${t.criterio_pronto.join(' ')} ${t.arquivos.join(' ')}`.replace(/menos[-_ ]?juros/gi, ''))

// Onda N = os ainda não feitos com dependência feita, na ordem da entrada; quem disputa arquivo com um
// que já entrou na onda espera a seguinte. Sem pronto e com resto, é ciclo.
function montarOndas(tickets) {
  const feitos = new Set()
  const resto = [...tickets]
  const out = []
  while (resto.length) {
    const prontos = resto.filter((t) => (t.depende_de ?? []).every((d) => feitos.has(d)))
    if (!prontos.length) return { ciclo: resto.map((t) => t.id) }
    const onda = []
    for (const t of prontos) if (!onda.some((o) => disputa(o, t))) onda.push(t)
    onda.forEach((t) => { feitos.add(t.id); resto.splice(resto.indexOf(t), 1) })
    out.push(onda)
  }
  return { ondas: out }
}

function decidir(mon) {
  const j = mon.jev ?? {}
  const exit = [0, 2, 3].includes(j.exit) ? j.exit : 1
  const cr = mon.code_review ?? {}
  const naoAtende = (mon.criterios ?? []).filter((c) => c.atende === false)
  const faltou = [
    ...(mon.faltou ?? []),
    ...(cr.bloqueia ? [...(cr.standards ?? []), ...(cr.spec ?? [])] : []),
    ...naoAtende.map((c) => `critério não atendido: ${c.criterio}${c.evidencia ? ` — ${c.evidencia}` : ''}`),
  ]
  if (exit === 1) return { veredito: 'humano', motivo: 'não julgado: o Jev não devolveu veredito válido, e o trabalho NÃO foi julgado', faltou }
  if (exit === 3) {
    const p = j.probabilidades ?? {}
    const topo = Object.keys(p).sort((x, y) => p[y] - p[x])[0]
    if (j.critico && topo === 'passou') return { veredito: 'revisao_humana', motivo: 'crítico: o Jev aprovaria; falta o olho humano', faltou }
    return { veredito: 'humano', motivo: `o Jev mandou ao humano${j.linha ? `: ${j.linha}` : ''}`, faltou }
  }
  if (exit === 2) return { veredito: 'refaz', motivo: `o Jev mandou refazer${j.linha ? `: ${j.linha}` : ''}`, faltou: faltou.length ? faltou : [j.linha ?? 'o Jev reprovou', 'releia a spec e a verificação'] }
  if (cr.bloqueia || naoAtende.length) return { veredito: 'refaz', motivo: 'o Jev passou, mas o code-review ou um critério bloqueia', faltou }
  return { veredito: 'passou', motivo: 'o Jev passou', faltou: [] }
}

const a = args ?? {}
const tickets = Array.isArray(a.tickets) ? a.tickets : []
const fim = (estado, extra = {}) => ({
  padrao: 'ondas', estado, ondas: [], tickets: {}, entregues: [], pendentes: [], arquivos: [], criticos: [], lacunas: [],
  decidido_sozinho: [], proximo_passo: PROXIMO[estado], ...extra,
})

// --- validação, sem gastar agente ---
const motivos = []
if (!tickets.length) motivos.push('tickets ausente ou vazio')
if (a.spec === undefined || a.spec === null || a.spec === '') motivos.push('spec ausente')
const ids = new Set()
for (const t of tickets) {
  if (!t || typeof t !== 'object') { motivos.push('ticket inválido'); continue }
  if (typeof t.id !== 'string' || !t.id) motivos.push('ticket sem id')
  else if (ids.has(t.id)) motivos.push(`id repetido: ${t.id}`)
  else ids.add(t.id)
  if (typeof t.objetivo !== 'string' || !t.objetivo) motivos.push(`${t.id ?? '?'}: sem objetivo`)
  if (!lista(t.arquivos)) motivos.push(`${t.id ?? '?'}: sem arquivos`)
  if (!lista(t.criterio_pronto)) motivos.push(`${t.id ?? '?'}: sem criterio_pronto`)
  if (t.depende_de !== undefined && !(Array.isArray(t.depende_de) && t.depende_de.every((d) => typeof d === 'string'))) motivos.push(`${t.id ?? '?'}: depende_de não é lista de ids`)
}
if (!motivos.length) {
  for (const t of tickets) for (const d of t.depende_de ?? []) if (!ids.has(d)) motivos.push(`${t.id}: depende_de ${d}, que não está na lista`)
}
const plano = motivos.length ? null : montarOndas(tickets)
if (plano?.ciclo) motivos.push(`dependência circular entre: ${plano.ciclo.join(', ')}`)
if (motivos.length) return fim('invalido', { motivos, motivo: motivos.join('; ') })

// --- a trava crítica vale para o conjunto ---
const criticosIds = tickets.filter(critico).map((t) => t.id)
if (criticosIds.length && a.autorizar_critico !== true) {
  log(`fluxo crítico sem autorização (${criticosIds.join(', ')}) — nada foi construído`)
  return fim('critico', { criticos: criticosIds, motivo: 'há ticket de fluxo crítico; autorize o conjunto antes de construir' })
}

const nomes = plano.ondas.map((o) => o.map((t) => t.id))
log(`ondas: ${nomes.map((o) => `[${o.join(', ')}]`).join(' → ')}`)

const resultados = {}
const entregues = []
const arquivos = []
const lacunas = []
const falhas = []
const decidido = []

for (let i = 0; i < plano.ondas.length; i++) {
  const onda = plano.ondas[i]
  phase('Ondas')
  const rs = await parallel(onda.map((t) => async () => {
    try {
      const r = await workflow('laco-de-refaz', { ticket: t, spec: a.spec, critico: a.critico, autorizar_critico: a.autorizar_critico })
      return r ?? { estado: 'humano', ticket: t.id, motivo: 'o laco-de-refaz não devolveu resultado' }
    } catch (e) {
      return { estado: 'humano', ticket: t.id, motivo: `o laco-de-refaz lançou: ${e?.message ?? e}` }
    }
  }))
  onda.forEach((t, k) => {
    const r = rs[k] ?? { estado: 'humano', ticket: t.id, motivo: 'o laco-de-refaz não devolveu resultado' }
    resultados[t.id] = r
    decidido.push(...(r.decidido_sozinho ?? []).map((d) => `${t.id}: ${d}`))
    if (r.estado === 'passou' || r.estado === 'revisao_humana') {
      entregues.push(t.id)
      for (const f of r.arquivos ?? []) if (!arquivos.includes(f)) arquivos.push(f)
    } else if (r.estado === 'lacuna') lacunas.push(`${t.id}: ${r.lacuna}`)
    else falhas.push(`${t.id}: ${r.estado} — ${r.motivo ?? ''}`)
  })
  if (falhas.length || lacunas.length) {
    const rodados = new Set(Object.keys(resultados))
    const pendentes = tickets.map((t) => t.id).filter((id) => !rodados.has(id))
    log(`onda ${i + 1} terminou com problema; não iniciados: ${pendentes.join(', ') || 'nenhum'}`)
    return fim(falhas.length ? 'humano' : 'lacuna', {
      ondas: nomes, tickets: resultados, entregues, pendentes, arquivos, lacunas, decidido_sozinho: decidido,
      criticos: criticosIds, motivo: [...falhas, ...lacunas].join('; '),
    })
  }
}

// --- fechamento: obrigatório; é a única prova de que as fatias somadas não quebraram nada ---
phase('Fechamento')
const temCritico = criticosIds.length > 0
const mon = await agent(
  `Fechamento da tarefa: todos os tickets passaram, cada um com a verificação só dos arquivos dele. Confira a SOMA.\n\n` +
  `Arquivos entregues (a união):\n${texto(arquivos)}\n\nTickets: ${entregues.join(', ')}\n\n` +
  'Passos, nesta ordem (só leia e não mexa no índice do git):\n' +
  '1. Grave a spec abaixo em "$TMPDIR/ondas-spec.md".\n' +
  `2. Grave o diff da união dos arquivos em "$TMPDIR/ondas-diff.txt", com os não rastreados: \`{ git diff HEAD -- ${arquivos.join(' ')}; for f in $(git ls-files --others --exclude-standard -- ${arquivos.join(' ')}); do git diff --no-index /dev/null "$f"; done; }\`.\n` +
  '3. Rode a verificação INTEIRA do projeto (`npm run verificar` se existir; senão o comando de teste do projeto), em background se passar do teto de 10 min do Bash, e grave a saída em "$TMPDIR/ondas-verificar.txt".\n' +
  '4. Rode a skill code-review sobre o diff, nos dois eixos; julgue os critérios de pronto da spec com evidência.\n' +
  `5. Rode \`node ~/.agents/skills/decision-gate/scripts/juiz.mjs --gate --spec-arquivo "$TMPDIR/ondas-spec.md" --diff-arquivo "$TMPDIR/ondas-diff.txt" --verificar-saida "$TMPDIR/ondas-verificar.txt"${temCritico ? ' --critico' : ''}\`.\n` +
  '6. Devolva em jev o EXIT CODE (0 passou · 2 refaz · 3 humano · 1 erro) e o JSON do stdout SEM interpretar, mais a linha do stderr em linha. Você não dá veredito próprio.\n\n' +
  `--- SPEC DA TAREFA ---\n${typeof a.spec === 'string' ? a.spec : texto(a.spec)}\n--- FIM ---`,
  { label: 'fechamento', phase: 'Fechamento', agentType: 'monitoring', schema: MONITORING })

const base = { ondas: nomes, tickets: resultados, entregues, arquivos, criticos: criticosIds, decidido_sozinho: decidido }
if (!mon) return fim('humano', { ...base, motivo: 'o monitoring de fechamento não respondeu' })
const d = decidir(mon)
const revisados = entregues.filter((id) => resultados[id].estado === 'revisao_humana' || criticosIds.includes(id))
const estado = d.veredito === 'passou' && revisados.length ? 'revisao_humana' : d.veredito
log(`fechamento: ${d.veredito}${revisados.length ? ` (críticos para revisão humana: ${revisados.join(', ')})` : ''}`)
return fim(estado, {
  ...base,
  fechamento: { jev: mon.jev ?? null, verificacao: mon.verificacao ?? null, faltou: d.faltou },
  motivo: d.motivo,
})
