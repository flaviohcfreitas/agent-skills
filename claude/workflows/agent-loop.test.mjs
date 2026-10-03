import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { simular, ler, avaliarMeta } from './simular.mjs'
import { decidirRodada } from '../../skills/agent-loop/scripts/agent-loop.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const NOME = 'agent-loop-rodadas'
const HASH = 'sha256:' + 'a'.repeat(64)
const SHA = 'b'.repeat(64)
const LINHA = 'PAPEIS: PAPEIS_SO=claude --escalada'
const COMANDO_FABLE = 'claude -p --agent monitoring --model fable --effort high --permission-mode dontAsk --allowedTools Read Grep Glob Bash --permission-prompts none < /tmp/b.md'

// ---------- estático ----------
test('estático: meta literal, phases batendo, nada proibido, sem workflow() e sem model/effort', () => {
  const corpo = ler(NOME)
  const meta = avaliarMeta(corpo)
  assert.equal(meta.name, NOME)
  assert.ok(meta.description && meta.whenToUse && Array.isArray(meta.phases) && meta.phases.length)
  const titulos = meta.phases.map((p) => p.title)
  for (const m of [...corpo.matchAll(/phase\('([^']+)'\)/g), ...corpo.matchAll(/phase:\s*'([^']+)'/g)]) assert.ok(titulos.includes(m[1]), `phase ${m[1]} fora do meta`)
  assert.doesNotMatch(corpo, /Date\.now|Math\.random|new Date\(|\bimport\b|\brequire\b|process\.|workflow\(/)
  assert.doesNotMatch(corpo, /\bmodel\s*:|\beffort\s*:/)
})

// ---------- helpers ----------
const ARGS = (extra = {}) => ({ slug: 'filtro', raiz: '/w/agent-loop-filtro', hash_checks: HASH, spec: 'Adicione o filtro de listagem por status.', card: 'MJ-9', ...extra })
const MANIFESTO = { comando: 'node run', arquivos: ['src/'], lista: ['filtra por status', 'a rota existe', 'vazio devolve lista vazia'], total: 3, base: 'base0' }
const PRE = (extra = {}) => ({
  preflight: { git_ok: true, hash_ok: true, comando_ok: true, motivos: [], script_sha: SHA, manifesto: MANIFESTO, ...extra },
  script_sha: SHA, harness: 'claude', modelo: 'claude-fable-5-1', execucao: { comando: COMANDO_FABLE, exit: 0 },
})
const IMP = (extra = {}) => ({ hipotese: 'hipótese', arquivos: ['src/a.js'], harness: 'claude', modelo: 'claude-sonnet-5-5', ...extra })
// A rodada que o script devolveria: a decisão sai da MESMA função.
const rod = (n, ent, extra = {}, topo = {}) => {
  const entradas = { hash_ok: true, fora_do_escopo: false, sem_mudanca: false, passam: [], passavam: [], total: 3, guarda_ok: true, jev: { exit: 2, confianca: 0.7, probabilidades: {}, critico: false }, critico: false, falharam: [], ...ent }
  const d = decidirRodada(entradas)
  return {
    rodada: { n, decisao: d.decisao, calculada: d.decisao, segue: d.segue, estado: d.estado, motivo: d.motivo, head: `sha${n}`, hash: HASH, script_sha: SHA, entradas, ...extra },
    exit: 0, script_sha: SHA, observacao: `observação ${n}`, harness: 'claude', modelo: 'claude-fable-5-1', execucao: { comando: COMANDO_FABLE, exit: 0 }, ...topo,
  }
}
const FECH = (extra = {}) => ({
  jev: { exit: 0, veredito: 'passou', confianca: 0.9, critico: false, probabilidades: { passou: 0.9 }, linha: 'ok' }, code_review: { bloqueia: false },
  criterios: [{ criterio: 'filtra', atende: true }], faltou: [], verificacao: { comando: 'npm run verificar', passou: true },
  harness: 'claude', modelo: 'claude-fable-5-1', execucao: { comando: COMANDO_FABLE, exit: 0 }, ...extra,
})
// Roteiro por label: rN = o que o monitoring da rodada N devolve; default: implement ok, preflight ok, fechamento passa.
const roteiro = (tabela = {}) => (prompt, opts) => {
  const l = opts.label
  if (l in tabela) { const v = tabela[l]; return typeof v === 'function' ? v(prompt, opts) : v }
  if (l === `monitoring:filtro.preflight`) return PRE()
  if (l === `monitoring:filtro.fechamento`) return FECH()
  if (opts.agentType === 'implement') return IMP()
  return null
}
const loop = (args, tabela, extra = {}) => simular(NOME, { args, agente: roteiro(tabela), ...extra })
const n = (r, p) => r.chamadas.filter((c) => c.opts.agentType === p).length
const A = ['a'], AB = ['a', 'b'], ABC = ['a', 'b', 'c']
const JEV2 = { exit: 2, confianca: 0.7, probabilidades: { refaz: 0.7 }, critico: false }
const JEV0 = { exit: 0, confianca: 0.9, probabilidades: { passou: 0.9 }, critico: false }

// ---------- validação e trava ----------
test('args inválidos: sem hash_checks, sem raiz, slug fora de [a-z0-9-], sem spec → invalido, zero agentes', async () => {
  for (const ruim of [{ hash_checks: undefined }, { hash_checks: 'abc' }, { raiz: undefined }, { slug: 'Filtro_X' }, { slug: undefined }, { spec: '' }, { rodadas: 0 }]) {
    const r = await loop(ARGS(ruim)); assert.equal(r.retorno.estado, 'invalido', JSON.stringify(ruim)); assert.equal(r.chamadas.length, 0)
    assert.equal(r.retorno.padrao, 'agent-loop'); assert.ok(r.retorno.proximo_passo)
  }
  assert.equal((await simular(NOME, { args: undefined })).retorno.estado, 'invalido')
})
test('crítico sem autorização: estado critico e zero agentes; o nome do projeto não é tema', async () => {
  const r = await loop(ARGS({ spec: 'Calcular a parcela do crédito' })); assert.equal(r.retorno.estado, 'critico'); assert.equal(r.chamadas.length, 0)
  const ok = await loop(ARGS({ spec: 'Filtro da listagem do MenosJuros', arquivos: ['src/'] }), { 'monitoring:filtro.1': rod(1, { passam: ABC, jev: JEV0 }) })
  assert.notEqual(ok.retorno.estado, 'critico')
  const r2 = await loop(ARGS({ critico: true })); assert.equal(r2.retorno.estado, 'critico')
})
test('o manifesto que o preflight devolve também passa pela trava crítica, antes de qualquer implement', async () => {
  const r = await loop(ARGS(), { 'monitoring:filtro.preflight': PRE({ manifesto: { ...MANIFESTO, lista: ['calcula a parcela'] } }) })
  assert.equal(r.retorno.estado, 'critico'); assert.equal(n(r, 'implement'), 0)
})
test('crítico autorizado: o monitoring recebe --critico, e Jev 3 com passou no topo e tudo verde termina revisao_humana, nunca pronto', async () => {
  const jev = { exit: 3, confianca: 0.8, critico: true, probabilidades: { passou: 0.7, refaz: 0.2, humano: 0.1 } }
  const r = await loop(ARGS({ spec: 'Débito automático', autorizar_critico: true }), { 'monitoring:filtro.1': rod(1, { passam: ABC, jev, critico: true }) })
  assert.equal(r.retorno.estado, 'revisao_humana'); assert.equal(r.retorno.mantidas, 1)
  assert.match(r.chamadas.find((c) => c.opts.label === 'monitoring:filtro.1').prompt, /--critico/)
  assert.notEqual(r.retorno.estado, 'pronto')
})

// ---------- preflight ----------
test('preflight com git_ok false: sem_git, zero implements', async () => {
  const r = await loop(ARGS(), { 'monitoring:filtro.preflight': PRE({ git_ok: false, motivos: ['commit vazio falhou'] }) })
  assert.equal(r.retorno.estado, 'sem_git'); assert.equal(n(r, 'implement'), 0); assert.match(r.retorno.motivo, /commit vazio/)
})
test('preflight: hash ou comando ruins → invalido; script_sha do shasum diferente do do script → violacao; modelo errado → harness', async () => {
  for (const [extra, estado] of [[{ hash_ok: false }, 'invalido'], [{ comando_ok: false }, 'invalido']]) {
    const r = await loop(ARGS(), { 'monitoring:filtro.preflight': PRE(extra) }); assert.equal(r.retorno.estado, estado); assert.equal(n(r, 'implement'), 0)
  }
  const r = await loop(ARGS(), { 'monitoring:filtro.preflight': { ...PRE(), script_sha: 'c'.repeat(64) } }); assert.equal(r.retorno.estado, 'violacao')
  const r2 = await loop(ARGS(), { 'monitoring:filtro.preflight': { ...PRE(), modelo: 'claude-opus-5-5' } }); assert.equal(r2.retorno.estado, 'harness'); assert.equal(n(r2, 'implement'), 0)
  const r3 = await loop(ARGS(), { 'monitoring:filtro.preflight': null }); assert.equal(r3.retorno.estado, 'humano'); assert.equal(n(r3, 'implement'), 0)
})

// ---------- a corrida ----------
test('mantém, desfaz, mantém com Jev 0 e tudo verde: pronto depois do fechamento; o 2º implement vê a hipótese e os checks falhos do 1º', async () => {
  const r = await loop(ARGS(), {
    'implement:filtro.1': IMP({ hipotese: 'tentar o filtro por status' }),
    'monitoring:filtro.1': rod(1, { passam: A, falharam: ['b', 'c'], jev: JEV2 }),
    'monitoring:filtro.2': rod(2, { passam: A, passavam: A, falharam: ['b', 'c'], jev: JEV2 }),
    'monitoring:filtro.3': rod(3, { passam: ABC, passavam: A, jev: JEV0 }),
  })
  const x = r.retorno
  assert.equal(x.estado, 'pronto'); assert.equal(x.rodadas, 3); assert.equal(x.mantidas, 2); assert.equal(x.desfeitas, 1)
  assert.deepEqual(x.historico.map((h) => h.decisao), ['mantem', 'desfaz', 'mantem'])
  assert.deepEqual(x.nota, { passam: 3, total: 3 }); assert.equal(x.head, 'sha3'); assert.equal(x.padrao, 'agent-loop')
  const imps = r.chamadas.filter((c) => c.opts.agentType === 'implement')
  assert.equal(imps.length, 3)
  assert.match(imps[1].prompt, /tentar o filtro por status/); assert.match(imps[1].prompt, /b, c/); assert.match(imps[1].prompt, /observação 1/)
  assert.match(imps[1].prompt, /\.agent-loop\/program\.md/); assert.match(imps[1].prompt, /uma hipótese por rodada/i)
  assert.ok(x.fechamento.jev); assert.ok(x.proximo_passo); assert.equal(n(r, 'monitoring'), 5) // preflight + 3 rodadas + fechamento
})
test('Jev 2 com progresso mantém; sem progresso desfaz; regressão desfaz sem passo do Jev; Jev 0 com vermelho vale 2', async () => {
  const r = await loop(ARGS({ rodadas: 4 }), {
    'monitoring:filtro.1': rod(1, { passam: A, jev: JEV2 }),
    'monitoring:filtro.2': rod(2, { passam: A, passavam: A, jev: JEV2 }),
    'monitoring:filtro.3': rod(3, { passam: ['b'], passavam: A, jev: null }),
    'monitoring:filtro.4': rod(4, { passam: AB, passavam: A, jev: JEV0 }),
  })
  assert.deepEqual(r.retorno.historico.map((h) => h.decisao), ['mantem', 'desfaz', 'desfaz', 'mantem'])
  assert.equal(r.retorno.historico[2].jev.exit, null); assert.equal(r.retorno.estado, 'teto')
})
test('Jev 1 → humano "não julgado", nunca pronto; Jev 3 → humano', async () => {
  const r = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: ABC, jev: { exit: 1 } }) })
  assert.equal(r.retorno.estado, 'humano'); assert.match(r.retorno.motivo, /não julgado/); assert.equal(r.retorno.mantidas, 0)
  const r2 = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: A, jev: { exit: 3, probabilidades: { humano: 0.8 } } }) })
  assert.equal(r2.retorno.estado, 'humano'); assert.equal(n(r2, 'implement'), 1)
})
test('lacuna do implement e implement mudo', async () => {
  const r = await loop(ARGS(), { 'implement:filtro.1': IMP({ lacuna: 'qual é o campo?' }) })
  assert.equal(r.retorno.estado, 'lacuna'); assert.match(r.retorno.motivo, /lacuna/); assert.equal(n(r, 'monitoring'), 1)
  const r2 = await loop(ARGS(), { 'implement:filtro.1': null }); assert.equal(r2.retorno.estado, 'humano')
})
test('rodada que o script não conseguiu rodar (exit != 0 ou sem JSON) vai a humano', async () => {
  const r = await loop(ARGS(), { 'monitoring:filtro.1': { ...rod(1, { passam: A }), exit: 1 } }); assert.equal(r.retorno.estado, 'humano')
  const r2 = await loop(ARGS(), { 'monitoring:filtro.1': { ...rod(1, { passam: A }), rodada: null } }); assert.equal(r2.retorno.estado, 'humano')
})

// ---------- o código confere ----------
test('hash devolvido diferente de args.hash_checks → violacao na hora', async () => {
  const r = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: A }, { hash: 'sha256:' + 'f'.repeat(64) }) })
  assert.equal(r.retorno.estado, 'violacao'); assert.equal(n(r, 'implement'), 1)
})
test('o sha do script mudando entre rodadas → violacao', async () => {
  const r = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: A }), 'monitoring:filtro.2': rod(2, { passam: AB, passavam: A }, { script_sha: 'd'.repeat(64) }, { script_sha: 'd'.repeat(64) }) })
  assert.equal(r.retorno.estado, 'violacao'); assert.equal(r.retorno.rodadas, 1)
  const r2 = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: A }, {}, { script_sha: 'd'.repeat(64) }) }); assert.equal(r2.retorno.estado, 'violacao') // o shasum do monitoring ≠ o do preflight
})
test('decisão do script diferente da recalculada → violacao', async () => {
  const r = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: A, passavam: A, jev: JEV2 }, { decisao: 'mantem', calculada: 'mantem' }) }) // sem avanço devia desfazer
  assert.equal(r.retorno.estado, 'violacao')
  const r2 = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: A, jev: null }) }) // precisa do Jev e veio sem
  assert.equal(r2.retorno.estado, 'violacao')
})
test('commit que falhou no hook: a rodada vale desfeita, e a corrida segue', async () => {
  const x = rod(1, { passam: A, jev: JEV2 }, { decisao: 'desfaz', segue: 'segue', estado: null, motivo: 'o commit falhou (hook?)' })
  const r = await loop(ARGS({ rodadas: 1 }), { 'monitoring:filtro.1': x })
  assert.equal(r.retorno.estado, 'teto'); assert.deepEqual(r.retorno.historico.map((h) => h.decisao), ['desfaz'])
})
test('harness: implement que declara cursor, ou monitoring sem --model fable, sem rodada a mais', async () => {
  const r = await loop(ARGS(), { 'implement:filtro.1': IMP({ harness: 'cursor', modelo: 'grok-4.7-high' }) })
  assert.equal(r.retorno.estado, 'harness'); assert.equal(n(r, 'monitoring'), 1)
  const r2 = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: A }, {}, { execucao: { comando: 'codex exec -m gpt-6-sol', exit: 0 } }) })
  assert.equal(r2.retorno.estado, 'harness'); assert.equal(n(r2, 'implement'), 1); assert.equal(r2.retorno.rodadas, 0)
  const r3 = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: A }, {}, { modelo: 'claude-opus-5-5' }) })
  assert.equal(r3.retorno.estado, 'harness')
})

// ---------- tetos ----------
test('4 desfeitas seguidas → estagnou; uma mantida no meio zera a conta', async () => {
  const des = (i) => [`monitoring:filtro.${i}`, rod(i, { passam: A, passavam: A, jev: JEV2 })]
  const r = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: A }), ...Object.fromEntries([2, 3, 4, 5].map(des)) })
  assert.equal(r.retorno.estado, 'estagnou'); assert.equal(r.retorno.rodadas, 5); assert.equal(r.retorno.desfeitas, 4)
  const des2 = (i, ids) => [`monitoring:filtro.${i}`, rod(i, { passam: ids, passavam: ids, jev: JEV2 })]
  const r2 = await loop(ARGS(), {
    'monitoring:filtro.1': rod(1, { passam: A }), ...Object.fromEntries([2, 3, 4].map(des)),
    'monitoring:filtro.5': rod(5, { passam: AB, passavam: A }), ...Object.fromEntries([6, 7, 8, 9].map((i) => des2(i, AB))),
  })
  assert.equal(r2.retorno.estado, 'estagnou'); assert.equal(r2.retorno.rodadas, 9) // a mantida da rodada 5 zerou a conta
})
test('o teto de rodadas: 3 → no máximo 3 implements; 99 → 30; padrão 12', async () => {
  const avanca = (i) => [`monitoring:filtro.${i}`, rod(i, { passam: Array.from({ length: i }, (_, k) => `c${k}`), passavam: Array.from({ length: i - 1 }, (_, k) => `c${k}`), total: 100 })]
  const tabela = Object.fromEntries(Array.from({ length: 40 }, (_, k) => avanca(k + 1)))
  const r = await loop(ARGS({ rodadas: 3 }), tabela); assert.equal(n(r, 'implement'), 3); assert.equal(r.retorno.estado, 'teto')
  const r2 = await loop(ARGS({ rodadas: 99 }), tabela); assert.equal(n(r2, 'implement'), 30); assert.equal(r2.retorno.estado, 'teto')
  const r3 = await loop(ARGS(), tabela); assert.equal(n(r3, 'implement'), 12)
})
test('orçamento baixo: para sem um implement a mais', async () => {
  let gasto = 0
  const budget = { total: 100, spent: () => gasto, remaining: () => 100 - gasto }
  const r = await simular(NOME, {
    args: ARGS(), budget,
    agente: (p, o) => { gasto += 60; return roteiro({ 'monitoring:filtro.1': rod(1, { passam: A }), 'monitoring:filtro.2': rod(2, { passam: AB, passavam: A }) })(p, o) },
  })
  assert.equal(r.retorno.estado, 'orcamento'); assert.equal(n(r, 'implement'), 1)
})

// ---------- os agentes ----------
test('todo agent() é de papel, sem model/effort, e todo prompt começa com a linha PAPEIS', async () => {
  const r = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: ABC, jev: JEV0 }) }) // o simulador lança com model/effort
  assert.ok(r.chamadas.length >= 4)
  for (const c of r.chamadas) { assert.ok(['implement', 'monitoring'].includes(c.opts.agentType)); assert.ok(c.prompt.startsWith(LINHA), c.opts.label) }
  const mon = r.chamadas.find((c) => c.opts.label === 'monitoring:filtro.1').prompt
  assert.match(mon, /agent-loop\.mjs rodada/); assert.match(mon, /--cwd \/w\/agent-loop-filtro/); assert.match(mon, /shasum -a 256/); assert.match(mon, new RegExp(HASH))
  assert.match(mon, /--card MJ-9/)
  assert.match(r.chamadas.find((c) => c.opts.label === 'monitoring:filtro.preflight').prompt, /agent-loop\.mjs preflight/)
  const im = r.chamadas.find((c) => c.opts.agentType === 'implement').prompt
  assert.match(im, /src\//); assert.match(im, /git commit/); assert.match(im, /claude-sonnet-5-5|harness/)
  assert.deepEqual(r.chamadas.map((c) => c.opts.label).slice(0, 3), ['monitoring:filtro.preflight', 'implement:filtro.1', 'monitoring:filtro.1'])
})

// ---------- fechamento ----------
test('fechamento: refaz não volta sozinho; vira refaz_fechamento com o faltou', async () => {
  const r = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: ABC, jev: JEV0 }), 'monitoring:filtro.fechamento': FECH({ jev: { exit: 2, linha: 'faltou borda' }, faltou: ['borda do vazio'] }) })
  assert.equal(r.retorno.estado, 'refaz_fechamento'); assert.match(JSON.stringify(r.retorno.fechamento.faltou), /borda do vazio/); assert.equal(n(r, 'implement'), 1)
})
test('fechamento: verificação inteira vermelha ou code-review que bloqueia não passam; crítico nunca passa', async () => {
  const base = { 'monitoring:filtro.1': rod(1, { passam: ABC, jev: JEV0 }) }
  const r = await loop(ARGS(), { ...base, 'monitoring:filtro.fechamento': FECH({ verificacao: { comando: 'npm run verificar', passou: false } }) }); assert.equal(r.retorno.estado, 'refaz_fechamento')
  const r2 = await loop(ARGS(), { ...base, 'monitoring:filtro.fechamento': FECH({ code_review: { bloqueia: true, standards: ['sem tipo'] } }) }); assert.equal(r2.retorno.estado, 'refaz_fechamento')
  const r3 = await loop(ARGS(), { ...base, 'monitoring:filtro.fechamento': FECH({ jev: { exit: 3, linha: 'humano' } }) }); assert.equal(r3.retorno.estado, 'humano')
  const r4 = await loop(ARGS({ critico: true, autorizar_critico: true }), { ...base, 'monitoring:filtro.fechamento': FECH() }); assert.equal(r4.retorno.estado, 'revisao_humana')
  const r5 = await loop(ARGS(), { ...base, 'monitoring:filtro.fechamento': FECH({ modelo: 'claude-opus-5-5' }) }); assert.equal(r5.retorno.estado, 'harness')
  const r6 = await loop(ARGS(), { ...base, 'monitoring:filtro.fechamento': null }); assert.equal(r6.retorno.estado, 'humano')
})
test('paridade: a função decidir do fechamento é a mesma do laço de refaz', () => {
  const pega = (t) => t.match(/function decidir\(mon, ehCritico\) \{[\s\S]*?\n\}\n/)?.[0]
  const laco = readFileSync(join(AQUI, 'laco-de-refaz.js'), 'utf8'), este = readFileSync(join(AQUI, `${NOME}.js`), 'utf8')
  assert.ok(pega(laco)); assert.equal(pega(este), pega(laco))
})

// ---------- refaz 1 ----------
test('fechamento: Jev 0 sem verificação nunca vira pronto', async () => {
  const base = { 'monitoring:filtro.1': rod(1, { passam: ABC, jev: JEV0 }) }
  for (const verificacao of [undefined, {}, { comando: 'x' }]) {
    const f = FECH(); if (verificacao === undefined) delete f.verificacao; else f.verificacao = verificacao
    const r = await loop(ARGS(), { ...base, 'monitoring:filtro.fechamento': f })
    assert.notEqual(r.retorno.estado, 'pronto'); assert.equal(r.retorno.estado, 'refaz_fechamento'); assert.match(JSON.stringify(r.retorno.fechamento.faltou), /verifica/)
  }
})
test('fechamento: o Jev recebe --verificar-saida, e o diff é o do branch inteiro (sem filtrar por arquivos)', async () => {
  const r = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: ABC, jev: JEV0 }) })
  const p = r.chamadas.find((c) => c.opts.label === 'monitoring:filtro.fechamento').prompt
  assert.match(p, /--verificar-saida/); assert.doesNotMatch(p, /--construtor/); /* o juiz.mjs não tem essa flag */ assert.match(p, /git diff base0\.\.HEAD`/); assert.doesNotMatch(p, /git diff base0\.\.HEAD --/)
})
test('harness: Fable só vale com harness claude e execução exit 0', async () => {
  const base = { 'monitoring:filtro.1': rod(1, { passam: A }, {}, { harness: 'cursor' }) }
  assert.equal((await loop(ARGS(), base)).retorno.estado, 'harness')
  assert.equal((await loop(ARGS(), { 'monitoring:filtro.preflight': { ...PRE(), harness: 'cursor' } })).retorno.estado, 'harness')
  assert.equal((await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: A }, {}, { execucao: { comando: COMANDO_FABLE, exit: 1 } }) })).retorno.estado, 'harness')
  const f = await loop(ARGS(), { 'monitoring:filtro.1': rod(1, { passam: ABC, jev: JEV0 }), 'monitoring:filtro.fechamento': FECH({ harness: 'cursor' }) })
  assert.equal(f.retorno.estado, 'harness')
})
test('o shasum vem como o `shasum` imprime ("hash  caminho"): vale o primeiro campo', async () => {
  const r = await loop(ARGS(), { 'monitoring:filtro.preflight': { ...PRE(), script_sha: `${SHA}  /h/.agents/skills/agent-loop/scripts/agent-loop.mjs` }, 'monitoring:filtro.1': rod(1, { passam: ABC, jev: JEV0 }, {}, { script_sha: `${SHA}  /x/agent-loop.mjs` }) })
  assert.equal(r.retorno.estado, 'pronto')
})
