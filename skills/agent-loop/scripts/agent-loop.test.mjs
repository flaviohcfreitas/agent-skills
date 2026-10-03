import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decidirRodada, limparPii, hashDosChecks } from './agent-loop.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(AQUI, 'agent-loop.mjs')
const MODELO = readFileSync(join(AQUI, '..', 'modelos', 'program.md'), 'utf8')

const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' })
const gitOk = (cwd, ...a) => { const r = git(cwd, ...a); assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`); return r.stdout.trim() }

// Um repo de brinquedo com um worktree agent-loop/<slug>. Os checks dão TAP: o check `a` passa se src/a existe.
// Cada teste cria um repo em $TMPDIR; tudo sai no fim da suíte.
const criados = []
after(() => { for (const b of criados) rmSync(b, { recursive: true, force: true }) })
function montar(slug = 'feat') {
  const base = mkdtempSync(join(tmpdir(), 'al-'))
  criados.push(base)
  const repo = join(base, 'repo'), wt = join(base, 'wt')
  mkdirSync(repo)
  gitOk(repo, 'init', '-q', '-b', 'main')
  gitOk(repo, 'config', 'user.email', 't@t'); gitOk(repo, 'config', 'user.name', 't')
  mkdirSync(join(repo, 'src')); writeFileSync(join(repo, 'src/keep.txt'), 'k')
  gitOk(repo, 'add', '-A'); gitOk(repo, 'commit', '-qm', 'base')
  gitOk(repo, 'worktree', 'add', '-q', wt, '-b', `agent-loop/${slug}`, 'HEAD')
  mkdirSync(join(wt, '.agent-loop'), { recursive: true })
  writeFileSync(join(wt, '.agent-loop/program.md'), MODELO)
  const rasc = join(wt, '.agent-loop', slug, 'rascunho')
  mkdirSync(rasc, { recursive: true })
  writeFileSync(join(rasc, 'run.mjs'),
    `import { existsSync } from 'node:fs'\nlet i = 0\nfor (const id of ['a', 'b', 'c']) console.log((existsSync('src/' + id) ? 'ok ' : 'not ok ') + (++i) + ' - ' + id)\n`)
  writeFileSync(join(rasc, 'manifesto.json'), JSON.stringify({
    comando: `node .agent-loop/${slug}/checks/run.mjs`, comando_guarda: 'node -e "process.exit(0)"',
    arquivos: ['src/'], lista: ['a existe', 'b existe', 'c existe'], total: 3,
  }))
  return { base, repo, wt, slug }
}
const al = (cwd, env, ...a) => spawnSync(process.execPath, [SCRIPT, ...a], { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
const json = (r) => { assert.ok(r.stdout.trim(), `sem stdout: ${r.stderr}`); return JSON.parse(r.stdout) }

function juizFalso(dir) {
  const f = join(dir, 'juiz-falso.mjs')
  writeFileSync(f, `import { appendFileSync } from 'node:fs'
appendFileSync(process.env.FAKE_LOG, 'chamada\\n')
const ok = new Set(['--gate', '--seco', '--critico', '--card', '--spec-arquivo', '--diff-arquivo', '--base', '--verificar-saida', '--brief-arquivo', '--saida-arquivo', '--tarefa', '--heuristica', '--modelo'])
const valorDe = new Set(['--card', '--spec-arquivo', '--diff-arquivo', '--base', '--verificar-saida', '--brief-arquivo', '--saida-arquivo', '--tarefa', '--heuristica', '--modelo'])
const av = process.argv.slice(2)
for (let i = 0; i < av.length; i++) { if (!ok.has(av[i])) { console.error('juiz: erro — argumento desconhecido: ' + av[i]); process.exit(1) } if (valorDe.has(av[i])) i++ }
console.log(process.env.FAKE_JEV_JSON ?? '{"veredito":"refaz","confianca":0.7,"probabilidades":{"passou":0.1,"refaz":0.7,"humano":0.2},"critico":false}')
process.exit(Number(process.env.FAKE_JEV_EXIT ?? 2))\n`)
  return f
}
function multicaFalso(dir) {
  const f = join(dir, 'multica-falso.mjs')
  writeFileSync(f, `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'
appendFileSync(process.env.FAKE_MULTICA_LOG, JSON.stringify({ args: process.argv.slice(2), corpo: readFileSync(0, 'utf8') }) + '\\n')\n`)
  chmodSync(f, 0o755)
  return f
}
function ambiente(m, extra = {}) {
  const log = join(m.base, 'juiz.log'), mlog = join(m.base, 'multica.log')
  writeFileSync(log, ''); writeFileSync(mlog, '')
  return { AGENT_LOOP_JUIZ: juizFalso(m.base), AGENT_LOOP_MULTICA: multicaFalso(m.base), FAKE_LOG: log, FAKE_MULTICA_LOG: mlog, ...extra }
}
const chamadasDoJuiz = (m) => readFileSync(join(m.base, 'juiz.log'), 'utf8').split('\n').filter(Boolean).length
const linhasDoMultica = (m) => readFileSync(join(m.base, 'multica.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const travar = (m) => { const r = al(m.wt, {}, 'travar', '--slug', m.slug); assert.equal(r.status, 0, r.stderr); return json(r).hash }
const rodada = (m, n, hash, env, extra = [], hipotese = `hipótese ${n}`) => {
  const spec = join(m.base, 'spec.md'); writeFileSync(spec, 'spec da feature')
  const hip = join(m.base, `hip${n}.txt`); writeFileSync(hip, hipotese)
  return al(m.wt, env, 'rodada', '--slug', m.slug, '--n', String(n), '--hash', hash, '--hipotese-arquivo', hip, '--spec-arquivo', spec, ...extra)
}
const escreve = (m, rel, c = 'x') => { mkdirSync(dirname(join(m.wt, rel)), { recursive: true }); writeFileSync(join(m.wt, rel), c) }
const linhas = (m) => readFileSync(join(m.wt, '.agent-loop', m.slug, 'rodadas.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))

// ---------- decidirRodada: a tabela da seção 7.1 ----------
const E = (extra = {}) => ({ hash_ok: true, fora_do_escopo: false, sem_mudanca: false, passam: ['a'], passavam: [], total: 3, guarda_ok: true, jev: { exit: 2, probabilidades: {}, critico: false }, critico: false, ...extra })
const D = (e) => decidirRodada(E(e))
const todos = ['a', 'b', 'c']

test('tabela 1: hash diferente desfaz e para em violacao', () => {
  const d = D({ hash_ok: false }); assert.equal(d.decisao, 'desfaz'); assert.equal(d.segue, 'fim'); assert.equal(d.estado, 'violacao')
})
test('tabela 2: fora do escopo desfaz e segue', () => {
  const d = D({ fora_do_escopo: true }); assert.equal(d.decisao, 'desfaz'); assert.equal(d.segue, 'segue')
})
test('rodada sem mudança desfaz e segue', () => {
  const d = D({ sem_mudanca: true }); assert.equal(d.decisao, 'desfaz'); assert.equal(d.segue, 'segue')
})
test('tabela 3: regressão e guarda vermelha desfazem sem precisar do Jev', () => {
  for (const e of [{ passavam: ['a', 'b'], passam: ['a'], jev: null }, { guarda_ok: false, jev: null }]) {
    const d = D(e); assert.equal(d.decisao, 'desfaz'); assert.equal(d.segue, 'segue'); assert.equal(d.chama_jev, false)
  }
})
test('tabela 4: Jev exit 1 (ou exit estranho) desfaz e para em humano, não julgado', () => {
  for (const exit of [1, 7, undefined]) {
    const d = D({ jev: { exit } }); assert.equal(d.decisao, 'desfaz'); assert.equal(d.estado, 'humano'); assert.match(d.motivo, /não julgado/)
  }
})
test('tabela 5: Jev 0 com todos verdes mantém e vai ao fechamento', () => {
  const d = D({ passam: todos, jev: { exit: 0 } }); assert.equal(d.decisao, 'mantem'); assert.equal(d.segue, 'fechamento')
})
test('tabela 6: Jev 0 com check vermelho vale como 2: mantém só com progresso estrito', () => {
  assert.equal(D({ passam: ['a'], passavam: [], jev: { exit: 0 } }).decisao, 'mantem')
  assert.equal(D({ passam: ['a'], passavam: ['a'], jev: { exit: 0 } }).decisao, 'desfaz')
  assert.equal(D({ passam: ['a'], jev: { exit: 0 } }).segue, 'segue')
})
test('tabela 7: Jev 3 crítico com passou no topo e todos verdes mantém e termina revisao_humana', () => {
  const d = D({ passam: todos, critico: true, jev: { exit: 3, critico: true, probabilidades: { passou: 0.7, refaz: 0.2, humano: 0.1 } } })
  assert.equal(d.decisao, 'mantem'); assert.equal(d.segue, 'fim'); assert.equal(d.estado, 'revisao_humana')
})
test('tabela 8: Jev 3 desfaz e para em humano (crítico sem passou no topo, ou sem todos verdes, também)', () => {
  for (const e of [{ jev: { exit: 3 } }, { passam: todos, critico: true, jev: { exit: 3, probabilidades: { refaz: 0.6, passou: 0.3 } } }, { passam: ['a'], critico: true, jev: { exit: 3, probabilidades: { passou: 0.9 } } }]) {
    const d = D(e); assert.equal(d.decisao, 'desfaz'); assert.equal(d.estado, 'humano')
  }
})
test('tabela 9 e 10: Jev 2 mantém com progresso estrito, desfaz sem', () => {
  assert.equal(D({ passam: ['a', 'b'], passavam: ['a'], jev: { exit: 2 } }).decisao, 'mantem')
  assert.equal(D({ passam: ['a'], passavam: ['a'], jev: { exit: 2 } }).decisao, 'desfaz')
  assert.equal(D({ passam: ['b'], passavam: ['a'], jev: { exit: 2 } }).decisao, 'desfaz') // regressão, linha 3
})
test('paridade: o texto da decidirRodada do workflow é o mesmo do script', () => {
  const marca = (t) => t.match(/\/\/ <decidirRodada>[\s\S]*?\/\/ <\/decidirRodada>/)?.[0]
  const wf = readFileSync(join(AQUI, '../../../claude/workflows/agent-loop-rodadas.js'), 'utf8')
  const sc = readFileSync(SCRIPT, 'utf8')
  assert.ok(marca(sc), 'script sem marcador'); assert.equal(marca(wf), marca(sc))
})

// ---------- PII (os valores são montados aqui, para não haver dado de cliente no arquivo) ----------
test('PII: CPF, CNPJ e telefone viram [pii]', () => {
  const cpf = ['123', '456', '789'].join('.') + '-09'
  const cnpj = ['12', '345', '678'].join('.') + '/0001-95'
  const tel = '(11) 9' + '1234-5678'
  const cru = '11' + '9' + '87654321'
  const r = limparPii(`cpf ${cpf}, cnpj ${cnpj}, tel ${tel} e ${cru}`)
  assert.equal(r.trocou, true); assert.doesNotMatch(r.texto, /\d{4,}/); assert.equal((r.texto.match(/\[pii\]/g) ?? []).length, 4)
  assert.deepEqual(limparPii('nada aqui 42'), { texto: 'nada aqui 42', trocou: false })
})

test('o script não tem git stash', () => {
  assert.doesNotMatch(readFileSync(SCRIPT, 'utf8'), /stash/i)
})

// ---------- travar ----------
test('travar: move rascunho para checks, grava manifesto com base e hash, commita; hash estável', () => {
  const m = montar(); const base = gitOk(m.wt, 'rev-parse', 'HEAD')
  const hash = travar(m)
  assert.match(hash, /^sha256:[0-9a-f]{64}$/)
  assert.ok(existsSync(join(m.wt, '.agent-loop/feat/checks/run.mjs'))); assert.ok(!existsSync(join(m.wt, '.agent-loop/feat/rascunho')))
  const man = JSON.parse(readFileSync(join(m.wt, '.agent-loop/feat/manifesto.json'), 'utf8'))
  assert.equal(man.base, base); assert.equal(man.hash, hash); assert.deepEqual(man.arquivos, ['src/'])
  assert.equal(gitOk(m.wt, 'status', '--porcelain'), '')
  assert.match(gitOk(m.wt, 'log', '-1', '--format=%s'), /trava os checks/)
  assert.equal(hashDosChecks(m.wt, 'feat'), hash); assert.equal(hashDosChecks(m.wt, 'feat'), hash)
  assert.equal(al(m.wt, {}, 'travar', '--slug', 'feat').status, 1) // já travado
})
test('travar: o hash muda com 1 byte num check, no comando, nos arquivos ou nas Regras fixas; Como trabalhar não entra', () => {
  const lerJ = (wt) => JSON.parse(readFileSync(join(wt, '.agent-loop/feat/manifesto.json'), 'utf8'))
  const gravaJ = (wt, j) => writeFileSync(join(wt, '.agent-loop/feat/manifesto.json'), JSON.stringify(j))
  const alterar = {
    check: (wt) => writeFileSync(join(wt, '.agent-loop/feat/checks/run.mjs'), readFileSync(join(wt, '.agent-loop/feat/checks/run.mjs'), 'utf8') + ' '),
    comando: (wt) => { const j = lerJ(wt); j.comando += ' '; gravaJ(wt, j) },
    comando_guarda: (wt) => { const j = lerJ(wt); j.comando_guarda += ' '; gravaJ(wt, j) },
    arquivos: (wt) => { const j = lerJ(wt); j.arquivos.push('lib/'); gravaJ(wt, j) },
    regras: (wt) => { const f = join(wt, '.agent-loop/program.md'); writeFileSync(f, readFileSync(f, 'utf8').replace('<!-- regras-fixas:inicio -->', '<!-- regras-fixas:inicio -->\nmais')) },
  }
  for (const [nome, fn] of Object.entries(alterar)) {
    const m = montar(); const hash = travar(m); fn(m.wt)
    assert.notEqual(hashDosChecks(m.wt, 'feat'), hash, nome)
  }
  const m = montar(); const hash = travar(m)
  const f = join(m.wt, '.agent-loop/program.md'); writeFileSync(f, readFileSync(f, 'utf8').replace('<!-- como-trabalhar:inicio -->', '<!-- como-trabalhar:inicio -->\nhábito novo'))
  assert.equal(hashDosChecks(m.wt, 'feat'), hash)
})
test('travar recusa o checkout principal e branch sem agent-loop/', () => {
  const m = montar()
  const r = al(m.repo, {}, 'travar', '--slug', 'feat'); assert.equal(r.status, 1); assert.match(r.stderr, /worktree|checkout principal/)
  gitOk(m.wt, 'checkout', '-q', '-b', 'outro')
  const r2 = al(m.wt, {}, 'travar', '--slug', 'feat'); assert.equal(r2.status, 1); assert.match(r2.stderr, /agent-loop\//)
})

// ---------- rodada ----------
test('rodada que avança mantém: commit novo, HEAD avança, linha no rodadas.jsonl, juiz chamado uma vez', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m); const antes = gitOk(m.wt, 'rev-parse', 'HEAD')
  escreve(m, 'src/a')
  const o = json(rodada(m, 1, hash, env))
  assert.equal(o.decisao, 'mantem'); assert.deepEqual(o.entradas.passam, ['a']); assert.equal(o.entradas.total, 3)
  assert.notEqual(gitOk(m.wt, 'rev-parse', 'HEAD'), antes); assert.equal(o.head, gitOk(m.wt, 'rev-parse', 'HEAD'))
  assert.equal(chamadasDoJuiz(m), 1)
  const l = linhas(m); assert.equal(l.length, 1); assert.equal(l[0].decisao, 'mantem'); assert.equal(l[0].n, 1)
  assert.match(o.script_sha, /^[0-9a-f]{64}$/)
})
test('rodada sem avanço desfaz: árvore igual ao HEAD mantido, patch em descartadas, rodadas.jsonl intacto e com a linha nova', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m)
  escreve(m, 'src/a'); assert.equal(json(rodada(m, 1, hash, env)).decisao, 'mantem')
  const head = gitOk(m.wt, 'rev-parse', 'HEAD')
  escreve(m, 'src/lixo', 'lixo'); escreve(m, 'src/keep.txt', 'mudou')
  const o = json(rodada(m, 2, hash, env))
  assert.equal(o.decisao, 'desfaz')
  assert.equal(gitOk(m.wt, 'rev-parse', 'HEAD'), head); assert.equal(gitOk(m.wt, 'status', '--porcelain'), '')
  assert.ok(!existsSync(join(m.wt, 'src/lixo'))); assert.equal(readFileSync(join(m.wt, 'src/keep.txt'), 'utf8'), 'k')
  const patch = readFileSync(join(m.wt, '.agent-loop/feat/descartadas/rodada-2.patch'), 'utf8')
  assert.match(patch, /lixo/); assert.match(patch, /mudou/)
  assert.deepEqual(linhas(m).map((x) => x.decisao), ['mantem', 'desfaz'])
  assert.equal(linhas(m)[1].prev.length, 64) // encadeada
})
test('rodada que toca fora dos arquivos desfaz, e o Jev não é chamado', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m)
  escreve(m, 'src/a'); escreve(m, 'fora/x.txt')
  const o = json(rodada(m, 1, hash, env))
  assert.equal(o.decisao, 'desfaz'); assert.equal(o.entradas.fora_do_escopo, true); assert.equal(chamadasDoJuiz(m), 0)
  assert.ok(!existsSync(join(m.wt, 'fora')))
})
test('regressão desfaz sem chamar o juiz', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m)
  escreve(m, 'src/a'); json(rodada(m, 1, hash, env)); assert.equal(chamadasDoJuiz(m), 1)
  unlinkSync(join(m.wt, 'src/a')); escreve(m, 'src/b') // b passa, a deixa de passar
  const o = json(rodada(m, 2, hash, env))
  assert.equal(o.decisao, 'desfaz'); assert.deepEqual(o.entradas.passam, ['b']); assert.deepEqual(o.entradas.passavam, ['a'])
  assert.equal(chamadasDoJuiz(m), 1); assert.ok(existsSync(join(m.wt, 'src/a')))
})
test('rodada sem mudança desfaz sem chamar o juiz', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m)
  const o = json(rodada(m, 1, hash, env)); assert.equal(o.decisao, 'desfaz'); assert.equal(o.entradas.sem_mudanca, true); assert.equal(chamadasDoJuiz(m), 0)
})
test('hash errado: desfaz, restaura os checks e para em violacao', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m)
  const f = join(m.wt, '.agent-loop/feat/checks/run.mjs'); writeFileSync(f, 'console.log("ok 1 - a")\n')
  const o = json(rodada(m, 1, hash, env))
  assert.equal(o.decisao, 'desfaz'); assert.equal(o.estado, 'violacao'); assert.equal(o.entradas.hash_ok, false)
  assert.match(readFileSync(f, 'utf8'), /existsSync/); assert.equal(chamadasDoJuiz(m), 0)
})
test('Jev exit 1 tenta de novo uma vez, e depois desfaz e para em humano', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m, { FAKE_JEV_EXIT: '1', FAKE_JEV_JSON: '{}' })
  escreve(m, 'src/a')
  const o = json(rodada(m, 1, hash, env))
  assert.equal(o.decisao, 'desfaz'); assert.equal(o.estado, 'humano'); assert.equal(chamadasDoJuiz(m), 2)
})
test('Jev 0 com todos verdes mantém e manda ao fechamento', () => {
  const m = montar(); const hash = travar(m)
  const env = ambiente(m, { FAKE_JEV_EXIT: '0', FAKE_JEV_JSON: '{"veredito":"passou","confianca":0.9,"probabilidades":{"passou":0.9},"critico":false}' })
  escreve(m, 'src/a'); escreve(m, 'src/b'); escreve(m, 'src/c')
  const o = json(rodada(m, 1, hash, env)); assert.equal(o.decisao, 'mantem'); assert.equal(o.segue, 'fechamento')
})

// ---------- Multica: PII e idempotência ----------
test('PII: a hipótese com CPF sai [pii] no comentário; publicar duas vezes não duplica', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m)
  const cpf = ['123', '456', '789'].join('.') + '-09'
  escreve(m, 'src/a')
  const o = json(rodada(m, 1, hash, env, ['--card', 'MJ-1'], `trata o cpf ${cpf} do teste`))
  assert.equal(o.decisao, 'mantem')
  const c = linhasDoMultica(m); assert.equal(c.length, 1)
  assert.deepEqual(c[0].args.slice(0, 4), ['issue', 'comment', 'add', 'MJ-1'])
  assert.match(c[0].corpo, /agent-loop feat #1/); assert.match(c[0].corpo, /\[pii\]/); assert.ok(!c[0].corpo.includes(cpf))
  assert.equal(linhas(m)[0].pii_trocado, true); assert.ok(!JSON.stringify(linhas(m)[0]).includes(cpf))
  const p = al(m.wt, env, 'publicar', '--slug', 'feat', '--card', 'MJ-1'); assert.equal(p.status, 0, p.stderr)
  al(m.wt, env, 'publicar', '--slug', 'feat', '--card', 'MJ-1')
  assert.equal(linhasDoMultica(m).length, 1)
})
test('Multica fora do ar não falha a rodada, e o publicar sobe o que faltou', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m)
  escreve(m, 'src/a')
  const o = json(rodada(m, 1, hash, { ...env, AGENT_LOOP_MULTICA: join(m.base, 'nao-existe') }, ['--card', 'MJ-1']))
  assert.equal(o.decisao, 'mantem'); assert.equal(linhasDoMultica(m).length, 0)
  al(m.wt, env, 'publicar', '--slug', 'feat', '--card', 'MJ-1'); assert.equal(linhasDoMultica(m).length, 1)
})

// ---------- preflight, fechar, habitos ----------
test('preflight: worktree, branch, árvore limpa, hash e comando; o commit vazio e o reset funcionam e não deixam rastro', () => {
  const m = montar(); const hash = travar(m); const head = gitOk(m.wt, 'rev-parse', 'HEAD')
  const o = json(al(m.wt, {}, 'preflight', '--slug', 'feat', '--hash', hash))
  assert.equal(o.git_ok, true); assert.equal(o.hash_ok, true); assert.equal(o.comando_ok, true)
  assert.equal(gitOk(m.wt, 'rev-parse', 'HEAD'), head); assert.match(o.script_sha, /^[0-9a-f]{64}$/)
  const ruim = json(al(m.wt, {}, 'preflight', '--slug', 'feat', '--hash', 'sha256:' + '0'.repeat(64)))
  assert.equal(ruim.hash_ok, false)
  const r = al(m.repo, {}, 'preflight', '--slug', 'feat', '--hash', hash); assert.equal(json(r).git_ok, false)
})
test('preflight: árvore suja não passa, mas graft/ (índice do MCP) é ruído', () => {
  const m = montar(); const hash = travar(m)
  escreve(m, 'graft/x.json'); assert.equal(json(al(m.wt, {}, 'preflight', '--slug', 'feat', '--hash', hash)).git_ok, true)
  escreve(m, 'src/sujo'); assert.equal(json(al(m.wt, {}, 'preflight', '--slug', 'feat', '--hash', hash)).git_ok, false)
})
test('fechar: copia rodadas.jsonl para resultados.jsonl, escreve o relatório e commita', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m)
  escreve(m, 'src/a'); json(rodada(m, 1, hash, env))
  const r = al(m.wt, {}, 'fechar', '--slug', 'feat'); assert.equal(r.status, 0, r.stderr)
  assert.ok(existsSync(join(m.wt, '.agent-loop/feat/resultados.jsonl'))); assert.match(readFileSync(join(m.wt, '.agent-loop/feat/relatorio.md'), 'utf8'), /mantidas/)
  assert.equal(gitOk(m.wt, 'status', '--porcelain'), '')
})
test('habitos --conferir falha quando muda algo fora do bloco Como trabalhar, e passa quando só o bloco muda', () => {
  const m = montar(); travar(m)
  const f = join(m.wt, '.agent-loop/program.md'); const orig = readFileSync(f, 'utf8')
  writeFileSync(f, orig.replace('<!-- como-trabalhar:inicio -->', '<!-- como-trabalhar:inicio -->\nhábito novo'))
  assert.equal(al(m.wt, {}, 'habitos', '--conferir').status, 0)
  writeFileSync(f, orig + '\nlinha extra fora do bloco\n')
  const r = al(m.wt, {}, 'habitos', '--conferir'); assert.equal(r.status, 1); assert.match(r.stderr, /fora do bloco/)
  writeFileSync(f, orig.replace('Nunca', 'Talvez'))
  assert.equal(al(m.wt, {}, 'habitos', '--conferir').status, 1)
})

// ---------- refaz 1: exit do comando, commit indevido, graft ----------
test('exit != 0 com saída TAP toda verde não conta como verde (rodada e preflight)', () => {
  const m = montar(); const f = join(m.wt, '.agent-loop/feat/rascunho/run.mjs')
  writeFileSync(f, "console.log('ok 1 - a'); console.log('ok 2 - b'); console.log('ok 3 - c'); process.exit(1)\n")
  const hash = travar(m); const env = ambiente(m)
  const pf = json(al(m.wt, {}, 'preflight', '--slug', 'feat', '--hash', hash)); assert.equal(pf.comando_ok, false)
  escreve(m, 'src/a')
  const o = json(rodada(m, 1, hash, env))
  assert.deepEqual(o.entradas.passam, []); assert.equal(o.decisao, 'desfaz'); assert.equal(o.entradas.comando_inconsistente, true)
})
test('commit do implement por conta própria não sobrevive: o desfaz volta ao último MANTIDO, e o mantém fica sobre ele', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m)
  const base = gitOk(m.wt, 'rev-parse', 'HEAD')
  escreve(m, 'src/lixo'); gitOk(m.wt, 'add', '-A'); gitOk(m.wt, 'commit', '-qm', 'implement commitou sozinho')
  const o = json(rodada(m, 1, hash, env))
  assert.equal(o.decisao, 'desfaz'); assert.equal(gitOk(m.wt, 'rev-parse', 'HEAD'), base); assert.ok(!existsSync(join(m.wt, 'src/lixo')))
  assert.equal(linhas(m)[0].commit_indevido, true)
  escreve(m, 'src/a'); gitOk(m.wt, 'add', '-A'); gitOk(m.wt, 'commit', '-qm', 'outro commit indevido')
  const o2 = json(rodada(m, 2, hash, env))
  assert.equal(o2.decisao, 'mantem'); assert.equal(gitOk(m.wt, 'rev-list', '--count', `${base}..HEAD`), '1')
  assert.equal(gitOk(m.wt, 'rev-parse', 'HEAD~1'), base)
})
test('retomada: o preflight confere o HEAD contra o último mantido do rodadas.jsonl', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m)
  escreve(m, 'src/a'); json(rodada(m, 1, hash, env))
  assert.equal(json(al(m.wt, {}, 'preflight', '--slug', 'feat', '--hash', hash)).git_ok, true)
  escreve(m, 'src/z'); gitOk(m.wt, 'add', '-A'); gitOk(m.wt, 'commit', '-qm', 'mexida à mão')
  const r = json(al(m.wt, {}, 'preflight', '--slug', 'feat', '--hash', hash))
  assert.equal(r.git_ok, false); assert.match(r.motivos.join(' '), /último mantido/)
})
test('o desfazer não apaga graft/', () => {
  const m = montar(); const hash = travar(m); const env = ambiente(m)
  escreve(m, 'graft/x.json'); escreve(m, 'src/lixo', 'l')
  const o = json(rodada(m, 1, hash, env)); assert.equal(o.decisao, 'desfaz')
  assert.ok(existsSync(join(m.wt, 'graft/x.json'))); assert.ok(!existsSync(join(m.wt, 'src/lixo')))
})
