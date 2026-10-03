export const meta = {
  name: 'agent-loop-rodadas',
  description: 'O agent-loop de UMA feature: rodadas de implement (contexto novo) e monitoring, cada uma mantida (commit) ou desfeita (reset) pela nota dos checks travados e do Jev; fechamento e Jev no fim. Só modelos Claude: implement Sonnet, monitoring Fable.',
  whenToUse: 'Chamado pela skill agent-loop, depois de os checks estarem aprovados e travados. args: { slug, raiz, hash_checks, spec, card?, rodadas?, arquivos?, lista?, critico?, autorizar_critico? }. Commita só no branch agent-loop/<slug> do worktree; não abre PR.',
  phases: [
    { title: 'Preflight', detail: 'o monitoring confere worktree, branch, árvore, hash, comando e o commit com reset' },
    { title: 'Implement', detail: 'uma hipótese por rodada, contexto novo' },
    { title: 'Monitoring', detail: 'o script dá a nota, mantém ou desfaz; o código confere' },
    { title: 'Fechamento', detail: 'verificação inteira, code-review e Jev sobre o diff da feature' },
  ],
}

const RODADAS_PADRAO = 12
const RODADAS_TETO = 30
const ESTAGNACAO = 4
const ULTIMAS = 8
const LINHA_PAPEIS = 'PAPEIS: PAPEIS_SO=claude --escalada'
const SCRIPT = '~/.agents/skills/agent-loop/scripts/agent-loop.mjs'
const MODELO_MONITORING = 'claude-fable-5-1'
// Regra que protege dinheiro fica em código, diga o reach o que disser.
const TEMA_CRITICO = /cr[eé]dito|parcela|pagamento|d[eé]bito|cobran[çc]a|juros|cadastro|autentica|login|senha|\bcpf\b|\bcnpj\b|open finance|proposta/i

const HARNESS = {
  harness: { type: 'string' }, modelo: { type: 'string' },
  execucao: { type: 'object', properties: { comando: { type: 'string' }, exit: { type: 'integer' } } },
}
const IMPLEMENT = {
  type: 'object',
  properties: { hipotese: { type: 'string' }, arquivos: { type: 'array', items: { type: 'string' } }, lacuna: { type: 'string' }, harness: { type: 'string' }, modelo: { type: 'string' } },
  required: ['harness', 'modelo'],
}
const PREFLIGHT = {
  type: 'object',
  properties: { preflight: { type: 'object' }, script_sha: { type: 'string' }, ...HARNESS },
  required: ['preflight', 'script_sha', 'harness', 'modelo', 'execucao'],
}
const RODADA = {
  type: 'object',
  properties: { rodada: { type: 'object' }, exit: { type: 'integer' }, script_sha: { type: 'string' }, observacao: { type: 'string' }, ...HARNESS },
  required: ['rodada', 'exit', 'script_sha', 'harness', 'modelo', 'execucao'],
}
const FECHAMENTO = {
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
    verificacao: { type: 'object', properties: { comando: { type: 'string' }, passou: { type: 'boolean' } }, required: ['comando', 'passou'] },
    ...HARNESS,
  },
  required: ['jev', 'code_review', 'criterios', 'verificacao', 'harness', 'modelo', 'execucao'],
}

const PROXIMO = {
  pronto: 'rode `agent-loop.mjs fechar` e `publicar`; revise o diff do branch agent-loop/<slug>; levar ao branch de trabalho, o PR e o merge são da sessão, sob o gate humano',
  revisao_humana: 'fluxo crítico, ou o Jev mandou conferir: o humano revisa o diff do branch agent-loop/<slug> antes de seguir',
  refaz_fechamento: 'o fechamento reprovou; leve o faltou ao usuário (ou ao reach, se for lacuna de checks) antes de rodar de novo',
  estagnou: 'quatro rodadas desfeitas seguidas: leve o historico ao reach; talvez os checks, a spec ou o program.md precisem mudar',
  teto: 'o teto de rodadas acabou: leve nota e historico ao usuário; rodar de novo continua do último estado mantido',
  orcamento: 'o orçamento acabou antes do teto: leve nota e historico ao usuário',
  humano: 'leve motivo e historico ao usuário',
  violacao: 'a trava foi quebrada (hash dos checks, script ou decisão): não confie na corrida; leve ao humano e confira o worktree e o program.md',
  harness: 'o harness ou o modelo que respondeu não é o combinado (implement Sonnet, monitoring Fable): confira a tabela de papeis e rode de novo',
  sem_git: 'o preflight não conseguiu escrever no git do worktree: arrume o worktree ou volte ao reach',
  lacuna: 'leve a lacuna ao reach; com a spec corrigida, rode de novo',
  critico: 'pergunte ao usuário; autorizado, rode de novo com autorizar_critico: true',
  invalido: 'corrija os args (motivos) ou o preflight',
}

const primeiro = (x) => String(x ?? '').trim().split(/\s+/)[0]
const texto = (o) => JSON.stringify(o, null, 2)
const lista = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x)

// <decidirRodada>
function decidirRodada(e) {
  const r = (decisao, segue, estado, motivo, chama_jev = false) => ({ decisao, segue, estado, motivo, chama_jev })
  if (!e.hash_ok) return r('desfaz', 'fim', 'violacao', 'o hash dos checks mudou: o program.md falhou, e quem decide é o humano')
  if (e.sem_mudanca) return r('desfaz', 'segue', null, 'rodada sem mudança')
  if (e.fora_do_escopo) return r('desfaz', 'segue', null, 'tocou fora dos arquivos permitidos')
  const passam = e.passam ?? []
  const passavam = e.passavam ?? []
  const regrediu = passavam.filter((id) => !passam.includes(id))
  if (regrediu.length) return r('desfaz', 'segue', null, `regressão: ${regrediu.join(', ')}`)
  if (!e.guarda_ok) return r('desfaz', 'segue', null, 'o comando de guarda falhou')
  if (!e.jev) return { decisao: null, segue: null, estado: null, motivo: 'falta o Jev', chama_jev: true }
  const j = e.jev
  const exit = [0, 2, 3].includes(j.exit) ? j.exit : 1
  const todos = e.total > 0 && passam.length === e.total
  if (exit === 1) return r('desfaz', 'fim', 'humano', 'não julgado: o Jev não devolveu veredito válido', true)
  if (exit === 3) {
    const p = j.probabilidades ?? {}
    const topo = Object.keys(p).sort((a, b) => p[b] - p[a])[0]
    if (e.critico && topo === 'passou' && todos) return r('mantem', 'fim', 'revisao_humana', 'crítico: o Jev aprovaria e os checks passam; falta o olho humano', true)
    return r('desfaz', 'fim', 'humano', 'o Jev mandou ao humano', true)
  }
  if (exit === 0 && todos) return r('mantem', 'fechamento', null, 'o Jev passou e todos os checks estão verdes', true)
  return passam.length > passavam.length
    ? r('mantem', 'segue', null, `os checks avançaram (${passavam.length}→${passam.length}/${e.total})`, true)
    : r('desfaz', 'segue', null, 'sem avanço nos checks', true)
}
// </decidirRodada>

// O veredito do fechamento é função do exit code do Jev, nunca da prosa do monitoring. Copiada do laco-de-refaz, com teste de paridade.
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
const fim = (estado, extra = {}) => ({
  padrao: 'agent-loop', slug: a.slug ?? null, card: a.card ?? null, estado, rodadas: 0, mantidas: 0, desfeitas: 0,
  nota: null, head: null, historico: [], fechamento: null, decidido_sozinho: [], proximo_passo: PROXIMO[estado], ...extra,
})

function validar() {
  const m = []
  if (typeof a.slug !== 'string' || !/^[a-z0-9-]+$/.test(a.slug)) m.push('slug ausente ou fora de [a-z0-9-]')
  if (typeof a.raiz !== 'string' || !a.raiz.startsWith('/')) m.push('raiz ausente: precisa ser o caminho absoluto do worktree')
  if (typeof a.hash_checks !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(a.hash_checks)) m.push('hash_checks ausente: ele só existe depois do `agent-loop.mjs travar`')
  if (typeof a.spec !== 'string' || !a.spec.trim()) m.push('spec ausente')
  if (a.rodadas !== undefined && !(Number.isInteger(a.rodadas) && a.rodadas >= 1)) m.push('rodadas precisa ser um inteiro >= 1')
  return m
}
const motivos = validar()
if (motivos.length) return fim('invalido', { motivos, motivo: motivos.join('; ') })

const ehCritico = (extra = '') => a.critico === true ||
  TEMA_CRITICO.test(`${a.spec} ${(a.lista ?? []).join(' ')} ${(a.arquivos ?? []).join(' ')} ${extra}`.replace(/menos[-_ ]?juros/gi, ''))
if (ehCritico() && a.autorizar_critico !== true) {
  log(`${a.slug}: fluxo crítico sem autorização: nada foi construído`)
  return fim('critico', { motivo: 'a feature toca fluxo crítico e precisa de autorização antes de construir' })
}

const teto = Math.min(a.rodadas ?? RODADAS_PADRAO, RODADAS_TETO)
const rotulo = (papel, parte) => `${papel}:${a.slug}.${parte}`
const ponte = (passo) =>
  `Você é o monitoring: rode o seu passo 2 (harness) pedindo o Fable. Se vier nativo:false, você é a ponte: rode \`rodar\` com \`--cwd ${a.raiz}\` e transcreva a saída; ` +
  `a volta traz harness, modelo e execucao (comando e exit). ${passo}`
const fableOk = (m) => m.harness === 'claude' && m.modelo === MODELO_MONITORING && /--model fable/.test(m.execucao?.comando ?? '') && m.execucao?.exit === 0
const critFlag = a.critico === true || a.autorizar_critico === true && ehCritico()

// ---------- preflight ----------
phase('Preflight')
const pre = await agent(
  `${LINHA_PAPEIS}\n\nagent-loop ${a.slug}: PREFLIGHT, antes de qualquer implement.\n` +
  ponte('') + '\n' +
  `1. Calcule \`shasum -a 256 ${SCRIPT}\` e devolva SÓ o hash (o primeiro campo) em script_sha.\n` +
  `2. Rode \`node ${SCRIPT} preflight --raiz ${a.raiz} --slug ${a.slug} --hash ${a.hash_checks}\` e devolva o JSON do stdout em preflight, SEM interpretar. ` +
  'Ele prova que a raiz é worktree, que o branch é agent-loop/, que a árvore está limpa, que o hash bate, que o comando dos checks roda, e que um commit vazio seguido de reset funciona aqui. ' +
  'Você não conserta nada e não decide: dá a evidência.',
  { label: rotulo('monitoring', 'preflight'), phase: 'Preflight', agentType: 'monitoring', schema: PREFLIGHT })
if (!pre) return fim('humano', { motivo: 'o monitoring do preflight não respondeu' })
if (!fableOk(pre)) return fim('harness', { motivo: `o preflight rodou em ${pre.modelo} (${pre.execucao?.comando ?? 'sem comando'}), e o combinado é ${MODELO_MONITORING} pela ponte (--model fable)` })
const pf = pre.preflight ?? {}
const SHA = pf.script_sha
if (primeiro(pre.script_sha) !== SHA) return fim('violacao', { motivo: 'o shasum do script que o monitoring calculou não é o que o próprio script informou' })
if (pf.git_ok !== true) return fim('sem_git', { motivo: `o preflight não escreveu no git do worktree: ${(pf.motivos ?? []).join('; ') || 'sem detalhe'}` })
if (pf.hash_ok !== true || pf.comando_ok !== true) return fim('invalido', { motivos: pf.motivos ?? [], motivo: `preflight reprovou: ${(pf.motivos ?? []).join('; ') || 'hash ou comando dos checks'}` })
const man = pf.manifesto ?? {}
const arquivos = Array.isArray(man.arquivos) && man.arquivos.length ? man.arquivos : (a.arquivos ?? [])
const checksEmPalavras = Array.isArray(man.lista) ? man.lista : (a.lista ?? [])
if (!lista(arquivos)) return fim('invalido', { motivo: 'o manifesto não traz os arquivos permitidos' })
if (a.autorizar_critico !== true && ehCritico(`${checksEmPalavras.join(' ')} ${arquivos.join(' ')}`)) {
  return fim('critico', { motivo: 'o manifesto (checks ou arquivos) toca fluxo crítico e precisa de autorização antes de construir' })
}
const total = man.total ?? checksEmPalavras.length

// ---------- as rodadas ----------
const historico = []
const decidido = []
let mantidas = 0, desfeitas = 0, seguidas = 0
let nota = { passam: 0, total }
let head = null
let falharamAgora = checksEmPalavras
const gastoInicial = budget.spent()
const resumo = () => ({ rodadas: mantidas + desfeitas, mantidas, desfeitas, nota, head, historico, decidido_sozinho: decidido })

for (let rodada = 1; rodada <= teto; rodada++) {
  if (budget.total != null && mantidas + desfeitas > 0) {
    const media = (budget.spent() - gastoInicial) / (mantidas + desfeitas)
    if (budget.remaining() < media) return fim('orcamento', { ...resumo(), motivo: `o orçamento restante não cobre outra rodada (média ${Math.round(media)})` })
  }

  phase('Implement')
  const ultimas = historico.slice(-ULTIMAS)
  const imp = await agent(
    `${LINHA_PAPEIS}\n\nagent-loop ${a.slug}, rodada ${rodada} de no máximo ${teto}. Seu contexto é NOVO: você não lembra das rodadas anteriores, só do que está abaixo.\n\n` +
    `Raiz (o seu worktree, trabalhe só nele): ${a.raiz}\n` +
    `1. Leia INTEIRO o ${a.raiz}/.agent-loop/program.md antes de qualquer coisa.\n\n` +
    `Spec da feature:\n${a.spec}\n\n` +
    `Arquivos permitidos (tudo fora deles desfaz a rodada): ${arquivos.join(', ')}\n\n` +
    `Checks em palavras:\n${checksEmPalavras.map((c) => `- ${c}`).join('\n')}\n\n` +
    `Checks que falham hoje, no último estado mantido: ${falharamAgora.length ? falharamAgora.join(', ') : '(nenhum a registrar)'}\n` +
    `Nota do último estado mantido: ${nota.passam}/${nota.total}\n\n` +
    (ultimas.length
      ? `As últimas ${ultimas.length} rodadas (a mais velha primeiro):\n${ultimas.map((h) => `- #${h.n} ${h.decisao === 'mantem' ? 'mantida' : 'desfeita'} ${h.passam}/${nota.total}: hipótese: ${h.hipotese}; falharam: ${(h.falharam ?? []).join(', ') || '—'}; o monitoring observou: ${h.observacao || '—'}`).join('\n')}\n\n`
      : 'Esta é a primeira rodada.\n\n') +
    'Regras: uma hipótese por rodada, e a declare antes de mexer; trabalhe só em ' + a.raiz + '; não toque em .agent-loop/; ' +
    'não rode git commit, git reset, git checkout, git clean nem git stash: quem mantém ou desfaz a rodada é o monitoring; nunca produção. ' +
    'Construa com as skills do implement (implement, tdd) e rode os checks localmente para ver o que quebra. ' +
    'Devolva { hipotese, arquivos, harness, modelo }, com o harness e o modelo que construíram. Se a spec tem lacuna, devolva a lacuna, sem decidir.',
    { label: rotulo('implement', rodada), phase: 'Implement', agentType: 'implement', schema: IMPLEMENT })
  if (!imp) return fim('humano', { ...resumo(), motivo: `o implement da rodada ${rodada} não respondeu` })
  if (imp.harness !== 'claude' || !/^claude-/.test(imp.modelo ?? '')) {
    return fim('harness', { ...resumo(), motivo: `o implement declarou ${imp.harness}:${imp.modelo}, e o combinado é Claude (Sonnet)` })
  }
  if (imp.lacuna) return fim('lacuna', { ...resumo(), lacuna: imp.lacuna, motivo: `o implement devolveu lacuna de spec na rodada ${rodada}` })
  const hipotese = (imp.hipotese ?? '').trim() || '(o implement não declarou hipótese)'

  phase('Monitoring')
  const mon = await agent(
    `${LINHA_PAPEIS}\n\nagent-loop ${a.slug}, rodada ${rodada}: dê a nota. Você não conserta e não decide: o script decide, e você dá a evidência.\n` +
    ponte('') + '\n' +
    `1. Calcule \`shasum -a 256 ${SCRIPT}\` ANTES de rodá-lo e devolva SÓ o hash (o primeiro campo) em script_sha.\n` +
    `2. Grave a spec abaixo em "$TMPDIR/agent-loop-${a.slug}-spec.md" e a hipótese em "$TMPDIR/agent-loop-${a.slug}-hip-${rodada}.txt".\n` +
    `3. Rode \`node ${SCRIPT} rodada --raiz ${a.raiz} --slug ${a.slug} --n ${rodada} --hash ${a.hash_checks} --hipotese-arquivo "$TMPDIR/agent-loop-${a.slug}-hip-${rodada}.txt" --spec-arquivo "$TMPDIR/agent-loop-${a.slug}-spec.md"${critFlag ? ' --critico' : ''}${a.card ? ` --card ${a.card}` : ''}\`.\n` +
    '4. Devolva em rodada o JSON do stdout SEM interpretar, e em exit o exit code. Não rode git commit, reset ou clean por conta própria: o script faz.\n' +
    '5. Devolva em observacao, em até 3 frases, o que a rodada tentou e por que a nota ficou como ficou: é o sinal para o próximo implement.\n\n' +
    `--- HIPÓTESE DA RODADA ---\n${hipotese}\n--- SPEC DA FEATURE ---\n${a.spec}\n--- FIM ---`,
    { label: rotulo('monitoring', rodada), phase: 'Monitoring', agentType: 'monitoring', schema: RODADA })
  if (!mon) return fim('humano', { ...resumo(), motivo: `o monitoring da rodada ${rodada} não respondeu` })
  if (!fableOk(mon)) return fim('harness', { ...resumo(), motivo: `o monitoring da rodada ${rodada} rodou em ${mon.modelo} (${mon.execucao?.comando ?? 'sem comando'}), e o combinado é ${MODELO_MONITORING} (--model fable)` })
  const r = mon.rodada
  if (mon.exit !== 0 || !r || typeof r !== 'object' || !r.entradas) return fim('humano', { ...resumo(), motivo: `o script da rodada ${rodada} não devolveu resultado (exit ${mon.exit})` })

  // O código confere: hash dos checks, o script, e a decisão recalculada.
  if (r.hash !== a.hash_checks) return fim('violacao', { ...resumo(), motivo: `o hash dos checks da rodada ${rodada} (${r.hash}) não é o travado` })
  if (primeiro(mon.script_sha) !== SHA || r.script_sha !== SHA) return fim('violacao', { ...resumo(), motivo: `o script mudou na rodada ${rodada}: o sha não é o do preflight` })
  const calc = decidirRodada(r.entradas)
  if (!calc.decisao || calc.decisao !== r.calculada) return fim('violacao', { ...resumo(), motivo: `a decisão do script na rodada ${rodada} (${r.calculada}) não é a recalculada em código (${calc.decisao ?? 'faltou o Jev'})` })
  if (!['mantem', 'desfaz'].includes(r.decisao)) return fim('violacao', { ...resumo(), motivo: `decisão desconhecida na rodada ${rodada}: ${r.decisao}` })
  const aplicada = r.decisao === calc.decisao ? calc : { ...calc, decisao: 'desfaz', segue: 'segue', estado: null, motivo: r.motivo ?? 'o commit falhou' }

  const e = r.entradas
  historico.push({
    n: rodada, hipotese, decisao: aplicada.decisao, passam: (e.passam ?? []).length, falharam: e.falharam ?? [],
    jev: { exit: e.jev?.exit ?? null, confianca: e.jev?.confianca ?? null }, motivo: aplicada.motivo, observacao: mon.observacao ?? '',
  })
  if (aplicada.decisao === 'mantem') {
    mantidas++; seguidas = 0
    nota = { passam: (e.passam ?? []).length, total: e.total ?? total }
    head = r.head ?? head
    falharamAgora = e.falharam ?? []
    if (e.jev && e.jev.exit !== 0) decidido.push(`rodada ${rodada} mantida por avanço nos checks (${nota.passam}/${nota.total}), com o Jev em ${e.jev.exit}`)
  } else { desfeitas++; seguidas++ }
  log(`${a.slug} #${rodada}: ${aplicada.decisao} — ${aplicada.motivo}`)

  if (aplicada.segue === 'fim') return fim(aplicada.estado, { ...resumo(), motivo: aplicada.motivo })
  if (aplicada.segue === 'fechamento') {
    // ---------- fechamento ----------
    phase('Fechamento')
    const fech = await agent(
      `${LINHA_PAPEIS}\n\nagent-loop ${a.slug}: FECHAMENTO. Todos os checks passam no último estado mantido (${head}) e o Jev da rodada passou. Confira a feature inteira.\n` +
      ponte('') + '\n' +
      `Trabalhe em ${a.raiz}. Só leia e rode; não mexa no índice do git. Passos, nesta ordem:\n` +
      `1. Rode a verificação INTEIRA do projeto (\`npm run verificar\` quando existe; senão a suíte do projeto e o comando dos checks) e devolva comando e se passou em verificacao. Grave a saída dessa verificação, mais a do comando dos checks, em "$TMPDIR/agent-loop-${a.slug}-fecha-verificar.txt".\n` +
      `2. Grave a spec abaixo em "$TMPDIR/agent-loop-${a.slug}-fecha-spec.md" e o diff do BRANCH INTEIRO da feature (checks e manifesto incluídos, sem filtrar por arquivos) em "$TMPDIR/agent-loop-${a.slug}-fecha-diff.txt": \`git diff ${man.base ?? '<base do manifesto>'}..HEAD\`.\n` +
      '3. Rode a skill code-review nesse diff, nos dois eixos (Standards e Spec); bloqueia=true se algum achado impede o merge. Julgue cada critério da spec com evidência.\n' +
      `4. Rode \`node ~/.agents/skills/decision-gate/scripts/juiz.mjs --gate --spec-arquivo "$TMPDIR/agent-loop-${a.slug}-fecha-spec.md" --diff-arquivo "$TMPDIR/agent-loop-${a.slug}-fecha-diff.txt" --verificar-saida "$TMPDIR/agent-loop-${a.slug}-fecha-verificar.txt"${critFlag ? ' --critico' : ''}\`. ` +
      'Devolva em jev o EXIT CODE (0 passou · 2 refaz · 3 humano · 1 erro) e o JSON do stdout SEM interpretar, mais a linha do stderr em linha. Você não dá veredito próprio: dá a evidência.\n\n' +
      `--- SPEC DA FEATURE ---\n${a.spec}\n--- FIM ---`,
      { label: rotulo('monitoring', 'fechamento'), phase: 'Fechamento', agentType: 'monitoring', schema: FECHAMENTO })
    if (!fech) return fim('humano', { ...resumo(), motivo: 'o monitoring do fechamento não respondeu' })
    if (!fableOk(fech)) return fim('harness', { ...resumo(), motivo: `o fechamento rodou em ${fech.modelo} (${fech.execucao?.comando ?? 'sem comando'}), e o combinado é ${MODELO_MONITORING} (--model fable)` })
    const veredito = decidir(fech, ehCritico(`${checksEmPalavras.join(' ')} ${arquivos.join(' ')}`))
    // Sem a verificação inteira, e verde, não há pronto: o Jev também não passa sem ela.
    const vermelha = fech.verificacao?.passou !== true
    const faltou = [...veredito.faltou, ...(vermelha ? [fech.verificacao?.passou === false ? `a verificação inteira reprovou: ${fech.verificacao.comando ?? ''}` : 'o fechamento não trouxe a verificação inteira (verificacao.passou)'] : [])]
    const resumoFech = { jev: fech.jev, verificacao: fech.verificacao ?? null, code_review: fech.code_review, faltou }
    let estado = veredito.veredito === 'passou' ? 'pronto' : veredito.veredito === 'refaz' ? 'refaz_fechamento' : veredito.veredito
    if (vermelha && (estado === 'pronto' || estado === 'revisao_humana')) estado = 'refaz_fechamento'
    return fim(estado, { ...resumo(), fechamento: resumoFech, motivo: vermelha && estado === 'refaz_fechamento' ? 'a verificação inteira não passou, ou não veio, no fechamento' : veredito.motivo })
  }
  if (seguidas >= ESTAGNACAO) return fim('estagnou', { ...resumo(), motivo: `${ESTAGNACAO} rodadas desfeitas seguidas` })
}
return fim('teto', { ...resumo(), motivo: `o teto de ${teto} rodadas acabou` })
