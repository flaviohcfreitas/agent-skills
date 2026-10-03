import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readlinkSync, lstatSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { simular, ler, avaliarMeta } from './simular.mjs'

const NOMES = ['laco-de-refaz', 'ondas', 'adversarial']

// ---------- estático ----------
for (const nome of NOMES) {
  test(`estático: ${nome}`, () => {
    const corpo = ler(nome)
    const meta = avaliarMeta(corpo)
    assert.equal(meta.name, nome)
    assert.ok(meta.description && meta.whenToUse && Array.isArray(meta.phases) && meta.phases.length)
    const titulos = meta.phases.map((p) => p.title)
    for (const m of [...corpo.matchAll(/phase\('([^']+)'\)/g), ...corpo.matchAll(/phase:\s*'([^']+)'/g)]) {
      assert.ok(titulos.includes(m[1]), `phase ${m[1]} fora do meta`)
    }
    assert.doesNotMatch(corpo, /Date\.now|Math\.random|new Date\(|\bimport\b|\brequire\b|process\./)
    if (nome !== 'ondas') assert.doesNotMatch(corpo, /workflow\(/)
  })
}

// ---------- laco-de-refaz ----------
const TK = (id, extra = {}) => ({ id, objetivo: `faz ${id}`, arquivos: [`src/${id}.js`, `src/${id}.test.js`], criterio_pronto: ['funciona'], ...extra })
const imp = (t, extra = {}) => ({ arquivos: t.arquivos, verificacao: { comando: 'npm test', passou: true, saida: 'ok' }, construtor: 'claude:sonnet', ...extra })
const mon = (exit, extra = {}) => ({ jev: { exit, confianca: 0.9, linha: 'linha-do-jev' }, code_review: { bloqueia: false }, criterios: [{ criterio: 'funciona', atende: true }], faltou: [], ...extra })
// Roteiro por label; default: implement devolve o ticket, monitoring e fechamento passam.
const roteiro = (tabela = {}, tickets = {}) => (prompt, opts) => {
  const l = opts.label
  if (l in tabela) { const v = tabela[l]; return typeof v === 'function' ? v(prompt, opts) : v }
  if (opts.agentType === 'implement') return imp(tickets[l.split(':')[1].split('.')[0]] ?? TK('T1'))
  if (opts.agentType === 'monitoring') return mon(0)
  return null
}
const laco = (args, tabela, tickets) => simular('laco-de-refaz', { args, agente: roteiro(tabela, tickets) })
const nPapel = (r, p) => r.chamadas.filter((c) => c.opts.agentType === p).length

test('laço: Jev 0 na volta 0 passa com 2 agentes', async () => {
  const r = await laco({ ticket: TK('T1') })
  assert.equal(r.retorno.estado, 'passou'); assert.equal(r.retorno.voltas, 0)
  assert.equal(r.chamadas.length, 2); assert.equal(r.retorno.construtor, 'claude:sonnet')
  assert.ok(r.retorno.proximo_passo)
})
test('laço: Jev 2 e depois 0 passa com voltas 1, e o faltou chega ao 2º implement', async () => {
  const r = await laco({ ticket: TK('T1') }, { 'monitoring:T1.0': mon(2, { faltou: ['falta X', 'falta Y'] }) })
  assert.equal(r.retorno.estado, 'passou'); assert.equal(r.retorno.voltas, 1)
  const imps = r.chamadas.filter((c) => c.opts.agentType === 'implement')
  assert.match(imps[1].prompt, /falta X/); assert.match(imps[1].prompt, /falta Y/)
})
test('laço: Jev 2,2,2 esgota depois de 3 implements e 3 monitorings', async () => {
  const r = await laco({ ticket: TK('T1') }, { 'monitoring:T1.0': mon(2, { faltou: ['a'] }), 'monitoring:T1.1': mon(2, { faltou: ['b'] }), 'monitoring:T1.2': mon(2, { faltou: ['c'] }) })
  assert.equal(r.retorno.estado, 'refaz_esgotado')
  assert.equal(nPapel(r, 'implement'), 3); assert.equal(nPapel(r, 'monitoring'), 3)
  assert.deepEqual(r.retorno.faltou, ['c'])
})
test('laço: Jev 3 vai a humano na hora', async () => {
  const r = await laco({ ticket: TK('T1') }, { 'monitoring:T1.0': mon(3) })
  assert.equal(r.retorno.estado, 'humano'); assert.equal(r.chamadas.length, 2)
})
for (const [nome, m] of [['exit 1', mon(1)], ['exit ausente', { ...mon(0), jev: { linha: 'x' } }], ['exit 7', mon(7)]]) {
  test(`laço: ${nome} é "não julgado", nunca passou`, async () => {
    const r = await laco({ ticket: TK('T1') }, { 'monitoring:T1.0': m })
    assert.equal(r.retorno.estado, 'humano'); assert.match(r.retorno.motivo, /não julgado/)
  })
}
test('laço: Jev 0 com code_review que bloqueia vira refaz', async () => {
  const r = await laco({ ticket: TK('T1') }, { 'monitoring:T1.0': mon(0, { code_review: { bloqueia: true, standards: ['sem tipo'] } }) })
  assert.equal(r.retorno.voltas, 1); assert.match(r.chamadas.filter((c) => c.opts.agentType === 'implement')[1].prompt, /sem tipo/)
})
test('laço: Jev 0 com critério que não atende vira refaz', async () => {
  const r = await laco({ ticket: TK('T1') }, { 'monitoring:T1.0': mon(0, { criterios: [{ criterio: 'borda', atende: false, evidencia: 'quebra' }] }) })
  assert.equal(r.retorno.voltas, 1); assert.match(r.chamadas.filter((c) => c.opts.agentType === 'implement')[1].prompt, /borda/)
})
test('laço: Jev 3 crítico com passou provável vira revisao_humana', async () => {
  const j = { exit: 3, critico: true, probabilidades: { passou: 0.7, refaz: 0.2, humano: 0.1 }, linha: 'l' }
  const r = await laco({ ticket: TK('T1'), critico: true, autorizar_critico: true }, { 'monitoring:T1.0': mon(3, { jev: j }) })
  assert.equal(r.retorno.estado, 'revisao_humana')
})
test('laço: lacuna termina sem monitoring', async () => {
  const r = await laco({ ticket: TK('T1') }, { 'implement:T1.0': { arquivos: [], verificacao: { comando: '', passou: false, saida: '' }, lacuna: 'spec não diz o teto' } })
  assert.equal(r.retorno.estado, 'lacuna'); assert.equal(r.retorno.lacuna, 'spec não diz o teto'); assert.equal(nPapel(r, 'monitoring'), 0)
})
test('laço: arquivo fora do ticket é refaz sem monitoring; pasta cobre o que está dentro', async () => {
  const r = await laco({ ticket: TK('T1') }, { 'implement:T1.0': imp(TK('T1'), { arquivos: ['src/T1.js', 'src/alheio.js'] }) })
  assert.equal(r.retorno.estado, 'passou'); assert.equal(r.retorno.voltas, 1)
  assert.equal(nPapel(r, 'monitoring'), 1)
  assert.match(r.chamadas.filter((c) => c.opts.agentType === 'implement')[1].prompt, /tocou fora do ticket: src\/alheio\.js/)
  const pasta = TK('T1', { arquivos: ['src/x/'] })
  const r2 = await laco({ ticket: pasta }, { 'implement:T1.0': imp(pasta, { arquivos: ['src/x/a.js', './src/x/b.js'] }) })
  assert.equal(r2.retorno.voltas, 0)
})
test('laço: implement null vira humano', async () => {
  const r = await laco({ ticket: TK('T1') }, { 'implement:T1.0': null })
  assert.equal(r.retorno.estado, 'humano')
})
test('laço: ticket crítico sem autorização trava com zero chamadas; o nome do projeto não é tema', async () => {
  const r = await laco({ ticket: TK('T1', { objetivo: 'ajusta o cálculo de juros da parcela' }), critico: false })
  assert.equal(r.retorno.estado, 'critico'); assert.equal(r.chamadas.length, 0)
  const r2 = await laco({ ticket: TK('T1', { objetivo: 'renomeia a pasta menos-juros' }) })
  assert.equal(r2.retorno.estado, 'passou')
})
test('laço: crítico autorizado roda e o monitoring recebe --critico', async () => {
  const r = await laco({ ticket: TK('T1', { objetivo: 'mexe no login' }), autorizar_critico: true })
  assert.ok(r.chamadas.find((c) => c.opts.agentType === 'monitoring').prompt.includes('--critico'))
})
test('laço: ticket inválido não gasta agente', async () => {
  for (const t of [{ ...TK('T1'), id: undefined }, TK('T1', { arquivos: [] }), TK('T1', { criterio_pronto: [] }), undefined]) {
    const r = await laco({ ticket: t })
    assert.equal(r.retorno.estado, 'invalido'); assert.ok(r.retorno.motivos.length); assert.equal(r.chamadas.length, 0)
  }
})

test('laço: crítico autorizado nunca termina passou, mesmo com exit 0', async () => {
  const r = await laco({ ticket: TK('T1', { objetivo: 'mexe no login' }), autorizar_critico: true }, { 'monitoring:T1.0': mon(0) })
  assert.equal(r.retorno.estado, 'revisao_humana')
})

// ---------- ondas ----------
const ondas = (args, tabela, filhos) => simular('ondas', { args: { spec: 'a spec', ...args }, agente: roteiro(tabela, args.mapa), filhos })
const mapaDe = (ts) => Object.fromEntries(ts.map((t) => [t.id, t]))
const run = (ts, tabela, extra = {}, filhos) => ondas({ tickets: ts, mapa: mapaDe(ts), ...extra }, tabela, filhos)

test('ondas: dependência e disputa de arquivo montam [[A],[B,C]] na ordem da entrada', async () => {
  const A = TK('A', { arquivos: ['src/a.js'] }), B = TK('B', { depende_de: ['A'] }), C = TK('C', { arquivos: ['src/a.js', 'src/c.js'] })
  const r = await run([A, B, C])
  assert.deepEqual(r.retorno.ondas, [['A'], ['B', 'C']]); assert.equal(r.retorno.estado, 'passou')
  assert.deepEqual(r.retorno.entregues, ['A', 'B', 'C'])
})
test('ondas: pasta prefixo e ./a disputam', async () => {
  const r1 = await run([TK('A', { arquivos: ['src/x/'] }), TK('B', { arquivos: ['src/x/a.ts'] })])
  assert.deepEqual(r1.retorno.ondas, [['A'], ['B']])
  const r2 = await run([TK('A', { arquivos: ['./a.ts'] }), TK('B', { arquivos: ['a.ts'] })])
  assert.deepEqual(r2.retorno.ondas, [['A'], ['B']])
})
test('ondas: entradas inválidas, zero chamadas', async () => {
  const casos = [
    [TK('A', { depende_de: ['B'] }), TK('B', { depende_de: ['A'] })],
    [TK('A', { depende_de: ['Z'] })],
    [TK('A'), TK('A')],
    [TK('A', { arquivos: [] })],
    [TK('A', { depende_de: 42 })],
    [TK('A', { depende_de: [1] })],
  ]
  for (const ts of casos) {
    const r = await run(ts)
    assert.equal(r.retorno.estado, 'invalido', JSON.stringify(ts)); assert.equal(r.chamadas.length, 0); assert.equal(r.workflows.length, 0)
  }
})
test('ondas: crítico sem autorização trava o conjunto, zero agentes e zero workflows', async () => {
  const r = await run([TK('A'), TK('B', { objetivo: 'muda o cadastro' }), TK('C')])
  assert.equal(r.retorno.estado, 'critico'); assert.deepEqual(r.retorno.criticos, ['B'])
  assert.equal(r.chamadas.length, 0); assert.equal(r.workflows.length, 0)
})
test('ondas: humano na onda 1 impede a onda 2 e lista pendentes', async () => {
  const ts = [TK('A', { arquivos: ['a'] }), TK('B', { arquivos: ['b'] }), TK('C', { arquivos: ['c'], depende_de: ['A'] })]
  const r = await run(ts, { 'monitoring:B.0': mon(3) })
  assert.equal(r.retorno.estado, 'humano'); assert.deepEqual(r.retorno.pendentes, ['C'])
  assert.equal(r.retorno.tickets.C, undefined)
})
test('ondas: lacuna vira estado lacuna', async () => {
  const ts = [TK('A', { arquivos: ['a'] }), TK('B', { arquivos: ['b'], depende_de: ['A'] })]
  const r = await run(ts, { 'implement:A.0': { arquivos: [], verificacao: { comando: '', passou: false, saida: '' }, lacuna: 'falta decisão' } })
  assert.equal(r.retorno.estado, 'lacuna'); assert.match(r.retorno.lacunas[0], /^A: /)
})
test('ondas: filho que lança vira humano naquele ticket, os irmãos seguem', async () => {
  const ts = [TK('A', { arquivos: ['a'] }), TK('B', { arquivos: ['b'] })]
  const r = await run(ts, {}, {}, { 'laco-de-refaz': (a) => { if (a.ticket.id === 'A') throw new Error('estourou'); return { estado: 'passou', ticket: 'B', arquivos: ['b'], decidido_sozinho: [] } } })
  assert.equal(r.retorno.estado, 'humano'); assert.match(r.retorno.tickets.A.motivo, /estourou/); assert.equal(r.retorno.tickets.B.estado, 'passou')
})
test('ondas: tudo passou roda um fechamento com a união; fechamento 2 vira refaz sem novo laço', async () => {
  const ts = [TK('A', { arquivos: ['a'] }), TK('B', { arquivos: ['b'], depende_de: ['A'] })]
  const r = await run(ts)
  const fech = r.chamadas.filter((c) => c.opts.label === 'fechamento')
  assert.equal(fech.length, 1); assert.match(fech[0].prompt, /"a"/); assert.match(fech[0].prompt, /"b"/)
  assert.equal(r.retorno.estado, 'passou')
  const r2 = await run(ts, { fechamento: mon(2, { faltou: ['soma quebrou'] }) })
  assert.equal(r2.retorno.estado, 'refaz'); assert.equal(r2.workflows.length, 2)
})
test('ondas: chama laco-de-refaz e repassa autorizar_critico', async () => {
  const r = await run([TK('A')], {}, { autorizar_critico: true })
  assert.equal(r.workflows[0].nome, 'laco-de-refaz'); assert.equal(r.workflows[0].args.autorizar_critico, true)
})
test('ondas: ticket revisao_humana conta como feito, ondas seguem, estado final não é passou', async () => {
  const ts = [TK('A', { objetivo: 'login', arquivos: ['a'] }), TK('B', { arquivos: ['b'], depende_de: ['A'] })]
  const j = { exit: 3, critico: true, probabilidades: { passou: 0.8, humano: 0.2 }, linha: 'l' }
  const r = await run(ts, { 'monitoring:A.0': mon(3, { jev: j }) }, { autorizar_critico: true })
  assert.equal(r.retorno.estado, 'revisao_humana'); assert.ok(r.retorno.tickets.B); assert.deepEqual(r.retorno.criticos, ['A'])
})

test('ondas: crítico nunca conta como passou no conjunto, nem se o filho disser passou', async () => {
  const r = await run([TK('A', { objetivo: 'login', arquivos: ['a'] })], {}, { autorizar_critico: true },
    { 'laco-de-refaz': () => ({ estado: 'passou', ticket: 'A', arquivos: ['a'], decidido_sozinho: [] }) })
  assert.equal(r.retorno.estado, 'revisao_humana')
})

// ---------- adversarial ----------
const voto = (refutada, n) => ({ refutada, evidencia: `ev-${n}-única`, endereco: `src/x.js:${n}` })
const adv = (args, votos) => simular('adversarial', { args: { afirmacao: 'o IOF está certo', ...args }, agente: (p, o) => votos[o.label.split(':')[1]] ?? null })
test('adversarial: maioria decide', async () => {
  const r = await adv({}, { correcao: voto(true, 1), seguranca: voto(true, 2), reproduz: voto(false, 3) })
  assert.equal(r.retorno.veredito, 'refutada'); assert.deepEqual(r.retorno.placar, { refutam: 2, sustentam: 1, sem_voto: 0, n: 3 })
  const r2 = await adv({}, { correcao: voto(true, 1), seguranca: voto(false, 2), reproduz: voto(false, 3) })
  assert.equal(r2.retorno.veredito, 'sustentada')
})
test('adversarial: voto perdido e empate vão a humano', async () => {
  const r = await adv({}, { correcao: voto(true, 1), seguranca: voto(false, 2) })
  assert.equal(r.retorno.veredito, 'humano'); assert.equal(r.retorno.placar.sem_voto, 1)
  const r2 = await adv({ lentes: ['correcao', 'seguranca', 'reproduz', 'spec'] }, { correcao: voto(true, 1), seguranca: voto(true, 2), reproduz: voto(false, 3), spec: voto(false, 4) })
  assert.equal(r2.retorno.veredito, 'humano')
})
test('adversarial: lente ruim ou poucas lentes é invalido, zero chamadas', async () => {
  for (const lentes of [['correcao', 'seguranca', 'xis'], ['correcao', 'correcao', 'seguranca'], ['correcao', 'seguranca']]) {
    const r = await adv({ lentes }, {})
    assert.equal(r.retorno.veredito, 'invalido'); assert.equal(r.chamadas.length, 0)
  }
  assert.equal((await adv({ afirmacao: '' }, {})).retorno.veredito, 'invalido')
})
test('adversarial: cada prompt traz a lente e a afirmação, cegos entre si, todos em paralelo', async () => {
  const r = await adv({}, { correcao: voto(true, 1), seguranca: voto(true, 2), reproduz: voto(false, 3) })
  assert.equal(r.maxEmVoo, 3)
  const por = Object.fromEntries(r.chamadas.map((c) => [c.opts.label.split(':')[1], c.prompt]))
  assert.match(por.correcao, /um caso \(entrada, borda, estado\)/); assert.match(por.seguranca, /vazar dado/); assert.match(por.reproduz, /Nunca contra produção/)
  for (const p of Object.values(por)) { assert.match(p, /o IOF está certo/); assert.doesNotMatch(p, /ev-\d-única/) }
})

// ---------- install.sh ----------
test('install.sh: links por arquivo e idempotente', () => {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const home = mkdtempSync(join(tmpdir(), 'inst-'))
  const rodar = () => execFileSync('bash', [join(repo, 'install.sh')], { env: { ...process.env, AGENT_SKILLS_HOME: home }, encoding: 'utf8' })
  const a = rodar()
  for (const n of NOMES) {
    const alvo = join(home, '.claude', 'workflows', `${n}.js`)
    assert.ok(lstatSync(alvo).isSymbolicLink()); assert.equal(readlinkSync(alvo), join(repo, 'claude', 'workflows', `${n}.js`))
  }
  assert.doesNotMatch(a, /simular|padroes\.test/)
  assert.doesNotMatch(rodar(), /workflows/)
})
