export const meta = {
  name: 'laco-de-refaz',
  description: 'Constrói UM ticket: implement e monitoring em laço, até 2 voltas de refaz; na 3ª, humano. O veredito sai do exit code do Jev, em código.',
  whenToUse: 'Um ticket fechado (id, objetivo, arquivos, criterio_pronto) para construir e conferir. args: { ticket, spec?, critico?, autorizar_critico? }. Não commita nem abre PR.',
  phases: [
    { title: 'Implement', detail: 'o implement constrói, ou devolve a lacuna' },
    { title: 'Monitoring', detail: 'o monitoring confere o diff e roda o Jev' },
  ],
}

const MAX_VOLTAS = 2
// Regra que protege dinheiro fica em código, diga o reach o que disser.
const TEMA_CRITICO = /cr[eé]dito|parcela|pagamento|d[eé]bito|cobran[çc]a|juros|cadastro|autentica|login|senha|\bcpf\b|\bcnpj\b|open finance|proposta/i

const IMPLEMENT = {
  type: 'object',
  properties: {
    arquivos: { type: 'array', items: { type: 'string' } },
    verificacao: { type: 'object', properties: { comando: { type: 'string' }, passou: { type: 'boolean' }, saida: { type: 'string' } }, required: ['comando', 'passou'] },
    lacuna: { type: 'string' },
    decisoes: { type: 'array', items: { type: 'string' } },
    construtor: { type: 'string' },
  },
  required: ['arquivos', 'verificacao'],
}
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
    code_review: { type: 'object', properties: { bloqueia: { type: 'boolean' }, standards: { type: 'array', items: { type: 'string' } }, spec: { type: 'array', items: { type: 'string' } } }, required: ['bloqueia'] },
    criterios: { type: 'array', items: { type: 'object', properties: { criterio: { type: 'string' }, atende: { type: 'boolean' }, evidencia: { type: 'string' } }, required: ['criterio', 'atende'] } },
    faltou: { type: 'array', items: { type: 'string' } },
  },
  required: ['jev', 'code_review', 'criterios'],
}

const PROXIMO = {
  passou: 'revise o diff dos arquivos; commit e PR são da sessão, sob o gate humano',
  revisao_humana: 'fluxo crítico: o Jev aprovaria, e o humano confere o diff antes de seguir',
  refaz_esgotado: 'leve motivo e faltou ao usuário',
  humano: 'leve motivo e faltou ao usuário',
  lacuna: 'leve a lacuna ao reach; com a spec corrigida, rode de novo',
  critico: 'pergunte ao usuário; autorizado, rode de novo com autorizar_critico: true',
  invalido: 'corrija os args (motivos)',
}

const texto = (o) => JSON.stringify(o, null, 2)
const lista = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x)

function validar(t) {
  if (!t || typeof t !== 'object') return ['ticket ausente']
  const m = []
  if (typeof t.id !== 'string' || !t.id) m.push('ticket sem id')
  if (typeof t.objetivo !== 'string' || !t.objetivo) m.push('ticket sem objetivo')
  if (!lista(t.arquivos)) m.push('ticket sem arquivos')
  if (!lista(t.criterio_pronto)) m.push('ticket sem criterio_pronto')
  if (t.depende_de !== undefined && !(Array.isArray(t.depende_de) && t.depende_de.every((d) => typeof d === 'string'))) m.push('depende_de não é lista de ids')
  return m
}
const critico = (t, a) => a.critico === true ||
  TEMA_CRITICO.test(`${t.objetivo} ${t.criterio_pronto.join(' ')} ${t.arquivos.join(' ')}`.replace(/menos[-_ ]?juros/gi, ''))
const norm = (p) => String(p).replace(/^(\.\/)+/, '').replace(/\/+$/, '')
const dentro = (arq, donos) => donos.some((d) => norm(arq) === norm(d) || norm(arq).startsWith(norm(d) + '/'))

// O veredito é função do exit code do Jev, nunca da prosa do monitoring.
function decidir(mon, ehCritico) {
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
    const topo = Object.keys(p).sort((a, b) => p[b] - p[a])[0]
    if (j.critico && topo === 'passou') return { veredito: 'revisao_humana', motivo: 'crítico: o Jev aprovaria; falta o olho humano', faltou }
    return { veredito: 'humano', motivo: `o Jev mandou ao humano${j.linha ? `: ${j.linha}` : ''}`, faltou }
  }
  if (exit === 2) return { veredito: 'refaz', motivo: `o Jev mandou refazer${j.linha ? `: ${j.linha}` : ''}`, faltou: faltou.length ? faltou : [j.linha ?? 'o Jev reprovou', 'releia a spec e a verificação'] }
  if (cr.bloqueia || naoAtende.length) return { veredito: 'refaz', motivo: 'o Jev passou, mas o code-review ou um critério bloqueia', faltou }
  if (ehCritico) return { veredito: 'revisao_humana', motivo: 'crítico: nunca termina passou; falta o olho humano', faltou }
  return { veredito: 'passou', motivo: 'o Jev passou', faltou: [] }
}

const a = args ?? {}
const t = a.ticket
const fim = (estado, extra = {}) => ({ padrao: 'laco-de-refaz', ticket: t?.id ?? null, estado, voltas: 0, historico: [], decidido_sozinho: [], proximo_passo: PROXIMO[estado], ...extra })

const motivos = validar(t)
if (motivos.length) return fim('invalido', { motivos, motivo: motivos.join('; ') })

const ehCritico = critico(t, a)
if (ehCritico && a.autorizar_critico !== true) {
  log(`${t.id}: fluxo crítico sem autorização — nada foi construído`)
  return fim('critico', { motivo: 'o ticket toca fluxo crítico e precisa de autorização antes de construir' })
}

const historico = []
const decidido = []
let faltou = null
let ultimo = {}

for (let volta = 0; ; volta++) {
  const imp = await agent(
    `Tarefa: ${typeof a.spec === 'string' ? a.spec : a.spec ? texto(a.spec) : t.objetivo}\n\nSeu ticket:\n${texto(t)}\n\n` +
    (faltou ? `O monitoring reprovou a entrega anterior. Falta:\n${faltou.map((f) => `- ${f}`).join('\n')}\n\n` : '') +
    `Arquivos EXCLUSIVOS deste ticket: ${t.arquivos.join(', ')}. Outros implements rodam em paralelo nos outros arquivos — não toque neles.\n` +
    'Construa com as skills do implement (implement, tdd); teste primeiro quando a fatia muda comportamento. ' +
    'Não commite, não abra PR, não mexa em arquivo fora do ticket. Rode a verificação dos arquivos do ticket e devolva o comando e se passou. ' +
    'Declare em construtor o harness:modelo que construiu. Se a spec tem lacuna, devolva a lacuna, sem decidir.',
    { label: `implement:${t.id}.${volta}`, phase: 'Implement', agentType: 'implement', schema: IMPLEMENT })
  if (!imp) return fim('humano', { voltas: volta, historico, decidido_sozinho: decidido, motivo: 'o implement não respondeu' })
  decidido.push(...(imp.decisoes ?? []))
  if (imp.lacuna) return fim('lacuna', { voltas: volta, historico, decidido_sozinho: decidido, lacuna: imp.lacuna, motivo: 'o implement devolveu lacuna de spec', construtor: imp.construtor })
  ultimo = { arquivos: imp.arquivos, verificacao: imp.verificacao, construtor: imp.construtor }

  const fora = imp.arquivos.filter((f) => !dentro(f, t.arquivos))
  let decisao
  let jev
  if (fora.length) {
    decisao = { veredito: 'refaz', motivo: 'o implement tocou fora do ticket', faltou: fora.map((f) => `tocou fora do ticket: ${f} — reverta a sua mudança nele, ou devolva lacuna`) }
    jev = { exit: null }
  } else {
    const mon = await agent(
      `Ticket:\n${texto(t)}\n\nO implement diz que mudou:\n${texto(imp.arquivos)}\ne rodou:\n${texto(imp.verificacao)}\n\n` +
      'Confira pelo DIFF, não pelo relato. Só leia e não mexa no índice do git. Passos, nesta ordem:\n' +
      `1. Grave o ticket${a.spec ? ' e a spec da tarefa' : ''} em "$TMPDIR/laco-${t.id}-spec.md".\n` +
      `2. Grave o diff SÓ dos arquivos do ticket em "$TMPDIR/laco-${t.id}-diff.txt", com os não rastreados: ` +
      `\`{ git diff HEAD -- ${t.arquivos.join(' ')}; for f in $(git ls-files --others --exclude-standard -- ${t.arquivos.join(' ')}); do git diff --no-index /dev/null "$f"; done; }\`. Nunca \`git diff HEAD\` inteiro.\n` +
      `3. Rode a verificação DO TICKET (os testes dos arquivos dele, não a suíte inteira: outros implements podem estar escrevendo) e grave a saída em "$TMPDIR/laco-${t.id}-verificar.txt".\n` +
      '4. Rode a skill code-review sobre esse diff, nos dois eixos (Standards e Spec); bloqueia=true se algum achado impede o merge. Julgue cada critério de pronto com evidência.\n' +
      `5. Rode \`node ~/.agents/skills/decision-gate/scripts/juiz.mjs --gate --spec-arquivo "$TMPDIR/laco-${t.id}-spec.md" --diff-arquivo "$TMPDIR/laco-${t.id}-diff.txt" --verificar-saida "$TMPDIR/laco-${t.id}-verificar.txt"${ehCritico ? ' --critico' : ''}\`.\n` +
      '6. Devolva em jev o EXIT CODE (0 passou · 2 refaz · 3 humano · 1 erro) e o JSON do stdout SEM interpretar (veredito, confianca, critico, probabilidades), mais a linha do stderr em linha. Você não dá veredito próprio: dá a evidência.' +
      (a.spec ? `\n\n--- SPEC DA TAREFA ---\n${typeof a.spec === 'string' ? a.spec : texto(a.spec)}\n--- FIM ---` : ''),
      { label: `monitoring:${t.id}.${volta}`, phase: 'Monitoring', agentType: 'monitoring', schema: MONITORING })
    if (!mon) return fim('humano', { voltas: volta, historico, decidido_sozinho: decidido, ...ultimo, motivo: 'o monitoring não respondeu' })
    decisao = decidir(mon, ehCritico)
    jev = mon.jev ?? {}
  }
  ultimo.jev = { exit: jev.exit ?? null, confianca: jev.confianca ?? null, linha: jev.linha ?? '' }
  historico.push({ volta, construtor: imp.construtor ?? null, exit: jev.exit ?? null, faltou: decisao.faltou })

  const comum = { voltas: volta, historico, decidido_sozinho: decidido, ...ultimo, motivo: decisao.motivo }
  if (decisao.veredito === 'passou' || decisao.veredito === 'revisao_humana') return fim(decisao.veredito, comum)
  if (decisao.veredito === 'humano') return fim('humano', { ...comum, faltou: decisao.faltou })
  if (volta >= MAX_VOLTAS) return fim('refaz_esgotado', { ...comum, faltou: decisao.faltou, motivo: `refaz depois de ${MAX_VOLTAS} voltas: ${decisao.motivo}` })
  faltou = decisao.faltou
  log(`${t.id}: refaz (${volta + 1}/${MAX_VOLTAS}) — ${decisao.motivo}`)
}
