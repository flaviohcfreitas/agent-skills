#!/usr/bin/env node
// O mecanismo do agent-loop (specs/loop-karpathy.md): trava os checks, dá a nota de cada rodada, mantém
// (commit) ou desfaz (reset) e registra. Quem o roda é o MONITORING, nunca o implement.
//
//   agent-loop.mjs travar    --slug s [--raiz dir]
//   agent-loop.mjs preflight --slug s [--hash h] [--raiz dir]
//   agent-loop.mjs rodada    --slug s --n N --hash h --hipotese-arquivo f --spec-arquivo f [--critico] [--card MJ-1] [--construtor h:m] [--raiz dir]
//   agent-loop.mjs publicar  --slug s --card MJ-1 [--raiz dir]
//   agent-loop.mjs fechar    --slug s [--raiz dir]
//   agent-loop.mjs habitos --conferir [--raiz dir]
//
// Tudo o que escreve no git recusa o checkout principal e qualquer branch que não comece com `agent-loop/`.
// O stdout é JSON; o stderr, a mensagem humana; exit 1 é erro. Ambiente para teste: AGENT_LOOP_JUIZ, AGENT_LOOP_MULTICA.
//
// O contrato do `comando` dos checks: TAP no stdout (`ok 1 - nome` / `not ok 2 - nome`, sem indentação) ou uma
// linha JSON {"agent_loop":{"passam":["id",...],"total":N}}. O id de um check é o nome dele.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, appendFileSync, realpathSync, mkdtempSync, copyFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ESTE = fileURLToPath(import.meta.url)
const RUIDO = ['graft/'] // índice do MCP graft: aparece em qualquer worktree e não é trabalho da rodada
const PREFIXO_BRANCH = 'agent-loop/'
const ZERO = '0'.repeat(64)

// ---------- a decisão da rodada: tabela da seção 7.1. O mesmo texto vive no workflow (teste de paridade) ----------
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

// ---------- PII: a mesma régua do hook pii-guard do MenosJuros, aplicada antes de publicar ----------
export function limparPii(texto) {
  let t = String(texto ?? '')
  const antes = t
  t = t.replace(/(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g, '[pii]')
  t = t.replace(/(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g, '[pii]')
  t = t.replace(/(?<!\d)(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}(?!\d)/g, '[pii]')
  return { texto: t, trocou: t !== antes }
}

// ---------- git ----------
const sh = (cmd, args, o = {}) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...o })
const git = (raiz, ...a) => sh('git', a, { cwd: raiz })
function gitOk(raiz, ...a) {
  const r = git(raiz, ...a)
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${(r.stderr || r.stdout).trim()}`)
  return r.stdout.trim()
}
const real = (p) => { try { return realpathSync(p) } catch { return resolve(p) } }

export function guardar(raiz) {
  const r = git(raiz, 'rev-parse', '--git-dir', '--git-common-dir')
  if (r.status !== 0) throw new Error(`${raiz} não é um repositório git`)
  const [gd, cd] = r.stdout.trim().split('\n').map((p) => real(resolve(raiz, p)))
  if (gd === cd) throw new Error('a raiz é o checkout principal, não um worktree: o agent-loop só roda em worktree')
  const branch = git(raiz, 'symbolic-ref', '--short', 'HEAD').stdout.trim()
  if (!branch.startsWith(PREFIXO_BRANCH)) throw new Error(`o branch "${branch}" não começa com ${PREFIXO_BRANCH}: o reset só roda em branch do agent-loop`)
  return branch
}

const norm = (p) => String(p).replace(/^(\.\/)+/, '').replace(/\/+$/, '')
const dentro = (arq, donos) => donos.some((d) => norm(arq) === norm(d) || norm(arq).startsWith(norm(d) + '/'))

// Os caminhos que a rodada mexeu (o porcelain, sem o ruído).
function mudados(raiz) {
  const partes = (git(raiz, 'status', '--porcelain', '-z', '-uall').stdout ?? '').split('\0').filter(Boolean)
  const caminhos = []
  for (let i = 0; i < partes.length; i++) {
    const [xy, p] = [partes[i].slice(0, 2), partes[i].slice(3)]
    caminhos.push(p)
    if (xy.includes('R') || xy.includes('C')) caminhos.push(partes[++i])
  }
  return caminhos.filter((c) => !RUIDO.some((r) => c.startsWith(r)))
}

// ---------- arquivos da corrida ----------
const dirAL = (raiz) => join(raiz, '.agent-loop')
const dirSlug = (raiz, slug) => join(raiz, '.agent-loop', slug)
const lerJson = (f) => JSON.parse(readFileSync(f, 'utf8'))
const sha = (b) => createHash('sha256').update(b).digest('hex')
const validarSlug = (s) => { if (!/^[a-z0-9-]+$/.test(s ?? '')) throw new Error('--slug deve ser [a-z0-9-]') }

function bloco(texto, nome) {
  const i = `<!-- ${nome}:inicio -->`, f = `<!-- ${nome}:fim -->`
  const a = texto.indexOf(i), b = texto.indexOf(f)
  return a < 0 || b < a ? null : texto.slice(a, b + f.length)
}
function listar(dir, base = dir) {
  const fora = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) fora.push(...listar(p, base))
    else fora.push(relative(base, p).split('\\').join('/'))
  }
  return fora.sort()
}

// sha256 sobre checks/, comando, comando_guarda e arquivos do manifesto, e o bloco "Regras fixas" do program.md.
export function hashDosChecks(raiz, slug) {
  const h = createHash('sha256')
  const checks = join(dirSlug(raiz, slug), 'checks')
  for (const rel of existsSync(checks) ? listar(checks) : []) {
    h.update(`F:${rel}\0`); h.update(readFileSync(join(checks, rel))); h.update('\0')
  }
  const man = lerJson(join(dirSlug(raiz, slug), 'manifesto.json'))
  h.update('M:' + JSON.stringify([man.comando, man.comando_guarda ?? null, man.arquivos]))
  const prog = existsSync(join(dirAL(raiz), 'program.md')) ? readFileSync(join(dirAL(raiz), 'program.md'), 'utf8') : ''
  h.update('R:' + (bloco(prog, 'regras-fixas') ?? ''))
  return 'sha256:' + h.digest('hex')
}

// ---------- os checks: rodar e ler ----------
function rodarComando(raiz, cmd, teto = 20 * 60_000) {
  const r = sh('/bin/sh', ['-c', cmd], { cwd: raiz, timeout: teto, killSignal: 'SIGKILL' })
  return { exit: r.status ?? -1, saida: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}
export function lerChecks(saida) {
  const linhas = String(saida).split('\n')
  const j = linhas.find((l) => l.startsWith('{"agent_loop"'))
  if (j) { try { const { passam = [], total = passam.length, falharam = [] } = JSON.parse(j).agent_loop; return { passam, falharam, total } } catch { /* cai para o TAP */ } }
  const passam = [], falharam = []
  for (const l of linhas) {
    const m = l.match(/^(not ok|ok) \d+ - (.+?)(?:\s+#.*)?$/)
    if (m) (m[1] === 'ok' ? passam : falharam).push(m[2].trim())
  }
  return { passam, falharam, total: passam.length + falharam.length }
}

// Exit do comando manda: saída verde com exit != 0 (crash, hook) não conta como verde.
export function lerComExit(r) {
  const lido = lerChecks(r.saida)
  if (r.exit !== 0 && lido.falharam.length === 0 && lido.passam.length > 0) {
    return { passam: [], falharam: lido.passam, total: lido.total, inconsistente: true }
  }
  return { ...lido, inconsistente: false }
}

// O estado que HEAD tem de ter: o último commit MANTIDO, ou o commit do travar se nada foi mantido ainda.
function esperadoHead(raiz, slug) {
  const mantida = lerRodadas(raiz, slug).filter((r) => r.decisao === 'mantem').pop()
  if (mantida?.head) return { sha: mantida.head, origem: `último mantido (#${mantida.n})` }
  const t = git(raiz, 'log', '-1', '--format=%H', '--', `.agent-loop/${slug}/manifesto.json`).stdout.trim()
  return { sha: t, origem: 'commit do travar' }
}

// ---------- o registro da rodada: rodadas.jsonl, append-only e encadeado ----------
const arqRodadas = (raiz, slug) => join(dirSlug(raiz, slug), 'rodadas.jsonl')
const arqPublicados = (raiz, slug) => join(dirSlug(raiz, slug), 'publicados.json')
function lerRodadas(raiz, slug) {
  const f = arqRodadas(raiz, slug)
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
}
function anexar(raiz, slug, linha) {
  const f = arqRodadas(raiz, slug)
  const texto = existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : []
  const prev = texto.length ? sha(texto[texto.length - 1]) : ZERO
  appendFileSync(f, JSON.stringify({ ...linha, prev }) + '\n')
}

// ---------- o Multica ----------
function textoDoComentario(slug, l) {
  const sufixo = l.decisao === 'mantem' ? 'mantida' : 'desfeita'
  return `agent-loop ${slug} #${l.n} — ${sufixo} ${l.passavam.length}→${l.passam.length}/${l.total}` +
    ` · Jev ${l.jev?.veredito ?? (l.jev?.exit != null ? `exit ${l.jev.exit}` : 'não chamado')}${l.jev?.confianca != null ? ` ${String(l.jev.confianca).replace('.', ',')}` : ''}` +
    ` · hipótese: ${l.hipotese}` + (l.falharam?.length ? ` · falharam: ${l.falharam.join(', ')}` : '') + ` · ${l.motivo}` + (l.head ? ` · ${l.head.slice(0, 9)}` : '')
}
function publicar(raiz, slug, card) {
  const f = arqPublicados(raiz, slug)
  const feitos = new Set(existsSync(f) ? lerJson(f) : [])
  const bin = process.env.AGENT_LOOP_MULTICA ?? 'multica'
  let subiu = 0
  for (const l of lerRodadas(raiz, slug)) {
    if (feitos.has(l.n)) continue
    const r = sh(bin, ['issue', 'comment', 'add', card, '--content-stdin'], { cwd: raiz, input: textoDoComentario(slug, l), timeout: 60_000 })
    if (r.status !== 0) continue // Multica fora do ar: fica para o próximo `publicar`
    feitos.add(l.n); subiu++
    writeFileSync(f, JSON.stringify([...feitos]))
  }
  return subiu
}

// ---------- o Jev ----------
function chamarJuiz(raiz, slug, man, { spec, saidaChecks, critico }) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-loop-juiz-'))
  const baseTravar = git(raiz, 'log', '-1', '--format=%H', '--', `.agent-loop/${slug}/manifesto.json`).stdout.trim() || 'HEAD'
  const arq = man.arquivos
  const tracked = git(raiz, 'diff', baseTravar, '--', ...arq).stdout
  const novos = git(raiz, 'ls-files', '--others', '--exclude-standard', '--', ...arq).stdout.split('\n').filter(Boolean)
  const diff = tracked + novos.map((f) => sh('git', ['diff', '--no-index', '/dev/null', f], { cwd: raiz }).stdout).join('')
  const ver = saidaChecks.length > 6000 ? saidaChecks.slice(0, 6000) : saidaChecks
  writeFileSync(join(dir, 'diff.txt'), diff); writeFileSync(join(dir, 'verificar.txt'), ver)
  const juiz = process.env.AGENT_LOOP_JUIZ ?? join(homedir(), '.agents/skills/decision-gate/scripts/juiz.mjs')
  const args = [juiz, '--gate', '--spec-arquivo', spec, '--diff-arquivo', join(dir, 'diff.txt'), '--verificar-saida', join(dir, 'verificar.txt'),
    ...(critico ? ['--critico'] : [])]
  let ultimo = { exit: 1 }
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = sh(process.execPath, args, { cwd: raiz, timeout: 5 * 60_000 })
    let j = {}
    try { j = JSON.parse(r.stdout) } catch { /* sem JSON: não julgado */ }
    ultimo = { exit: r.status ?? 1, veredito: j.veredito, confianca: j.confianca, probabilidades: j.probabilidades, critico: j.critico ?? critico, linha: (r.stderr ?? '').trim().split('\n').pop() }
    if ([0, 2, 3].includes(ultimo.exit)) break
  }
  ultimo.cortado = diff.length > 40000 || saidaChecks.length > 6000
  return ultimo
}

// ---------- os comandos ----------
function travar(raiz, slug) {
  guardar(raiz); validarSlug(slug)
  const dir = dirSlug(raiz, slug), rasc = join(dir, 'rascunho')
  if (existsSync(join(dir, 'manifesto.json'))) throw new Error(`${slug} já está travado (manifesto.json existe)`)
  if (!existsSync(join(rasc, 'manifesto.json'))) throw new Error(`falta ${relative(raiz, rasc)}/manifesto.json (comando, arquivos, lista)`)
  const man = lerJson(join(rasc, 'manifesto.json'))
  if (typeof man.comando !== 'string' || !man.comando) throw new Error('manifesto sem comando')
  if (!Array.isArray(man.arquivos) || !man.arquivos.length || !man.arquivos.every((a) => typeof a === 'string')) throw new Error('manifesto sem arquivos')
  if (!Array.isArray(man.lista) || !man.lista.length) throw new Error('manifesto sem a lista dos checks em palavras')
  if (!existsSync(join(dirAL(raiz), 'program.md'))) copyFileSync(join(dirname(ESTE), '..', 'modelos', 'program.md'), join(dirAL(raiz), 'program.md'))
  writeFileSync(join(dirAL(raiz), '.gitignore'), '*/rodadas.jsonl\n*/descartadas/\n*/publicados.json\n')
  const base = gitOk(raiz, 'rev-parse', 'HEAD')
  mkdirSync(join(dir, 'checks'), { recursive: true })
  for (const rel of listar(rasc)) {
    if (rel === 'manifesto.json') continue
    mkdirSync(dirname(join(dir, 'checks', rel)), { recursive: true })
    renameSync(join(rasc, rel), join(dir, 'checks', rel))
  }
  const { hash: _h, base: _b, ...limpo } = man
  writeFileSync(join(dir, 'manifesto.json'), JSON.stringify({ ...limpo, total: man.total ?? man.lista.length, base }, null, 2) + '\n')
  rmSync(rasc, { recursive: true, force: true })
  const hash = hashDosChecks(raiz, slug)
  writeFileSync(join(dir, 'manifesto.json'), JSON.stringify({ ...lerJson(join(dir, 'manifesto.json')), hash }, null, 2) + '\n')
  gitOk(raiz, 'add', '-A', '--', '.agent-loop')
  gitOk(raiz, 'commit', '-q', '-m', `agent-loop ${slug}: trava os checks (${hash.slice(0, 15)})`)
  return { slug, hash, base, commit: gitOk(raiz, 'rev-parse', 'HEAD') }
}

function preflight(raiz, slug, hashEsperado) {
  const motivos = []
  const saida = { git_ok: false, hash_ok: false, comando_ok: false, motivos, script_sha: sha(readFileSync(ESTE)) }
  let man = null
  try {
    saida.branch = guardar(raiz)
    const suja = mudados(raiz)
    const esp = esperadoHead(raiz, slug)
    if (suja.length) motivos.push(`a árvore não está limpa: ${suja.slice(0, 5).join(', ')}`)
    else if (esp.sha && gitOk(raiz, 'rev-parse', 'HEAD') !== esp.sha) motivos.push(`o HEAD não é o ${esp.origem} (${esp.sha.slice(0, 9)}): o worktree foi mexido desde a última rodada`)
    else {
      const head = gitOk(raiz, 'rev-parse', 'HEAD')
      // Prova que o `claude -p` do monitoring escreve no git do worktree: commit vazio e reset.
      const c = git(raiz, 'commit', '--allow-empty', '--no-verify', '-q', '-m', 'agent-loop preflight')
      if (c.status !== 0) motivos.push(`commit vazio falhou: ${(c.stderr || c.stdout).trim()}`)
      else {
        const rs = git(raiz, 'reset', '--hard', '-q', head)
        if (rs.status !== 0 || gitOk(raiz, 'rev-parse', 'HEAD') !== head) motivos.push(`reset falhou: ${(rs.stderr || '').trim()}`)
        else saida.git_ok = true
      }
    }
  } catch (e) { motivos.push(e.message) }
  try {
    man = lerJson(join(dirSlug(raiz, slug), 'manifesto.json'))
    saida.manifesto = { comando: man.comando, comando_guarda: man.comando_guarda ?? null, arquivos: man.arquivos, lista: man.lista, total: man.total, base: man.base }
    const h = hashDosChecks(raiz, slug)
    saida.hash = h
    saida.hash_ok = h === man.hash && (!hashEsperado || h === hashEsperado)
    if (!saida.hash_ok) motivos.push('o hash dos checks não bate')
  } catch (e) { motivos.push(`hash: ${e.message}`) }
  if (man) {
    const r = rodarComando(raiz, man.comando)
    const lido = lerComExit(r)
    saida.comando_ok = lido.total > 0 && !lido.inconsistente
    if (!saida.comando_ok) motivos.push(`o comando dos checks não devolveu TAP nem JSON coerente com o exit (exit ${r.exit})`)
  }
  return saida
}

function rodada(raiz, o) {
  const slug = o.slug, n = Number(o.n)
  const branch = guardar(raiz); validarSlug(slug)
  if (!Number.isInteger(n) || n < 1) throw new Error('--n inválido')
  if (!o.hash) throw new Error('--hash obrigatório')
  // Commit do implement por conta própria não sobrevive: volta ao último mantido, e o trabalho dele segue na árvore.
  const esperado = esperadoHead(raiz, slug).sha
  const commit_indevido = !!esperado && gitOk(raiz, 'rev-parse', 'HEAD') !== esperado
  if (commit_indevido) gitOk(raiz, 'reset', '--mixed', '-q', esperado)
  const man = lerJson(join(dirSlug(raiz, slug), 'manifesto.json'))
  const hashAtual = hashDosChecks(raiz, slug)
  const hash_ok = hashAtual === o.hash && hashAtual === man.hash
  const rodadas = lerRodadas(raiz, slug)
  const passavam = [...(rodadas.filter((r) => r.decisao === 'mantem').pop()?.passam ?? [])]
  const hipRaw = o['hipotese-arquivo'] ? readFileSync(o['hipotese-arquivo'], 'utf8').trim() : ''
  const hip = limparPii(hipRaw)

  const caminhos = mudados(raiz)
  const sem_mudanca = caminhos.length === 0
  const fora_do_escopo = caminhos.some((c) => !dentro(c, man.arquivos))
  let comando_inconsistente = false, passam = [], falharam = [], total = man.total ?? 0, guarda_ok = true, saidaChecks = ''
  if (hash_ok && !sem_mudanca && !fora_do_escopo) {
    const r = rodarComando(raiz, man.comando)
    const lido = lerComExit(r)
    comando_inconsistente = lido.inconsistente
    passam = lido.passam; falharam = lido.falharam; total = Math.max(total, lido.total)
    saidaChecks = `FALHAM: ${falharam.join(', ') || '(nenhum)'}\n${r.saida}`
    const regrediu = passavam.some((id) => !passam.includes(id))
    if (!regrediu && man.comando_guarda) {
      const g = rodarComando(raiz, man.comando_guarda)
      guarda_ok = g.exit === 0
      saidaChecks += `\n--- guarda (exit ${g.exit}) ---\n${g.saida}`
    }
  }
  const entradas = { hash_ok, fora_do_escopo, sem_mudanca, passam, passavam, falharam, total, guarda_ok, comando_inconsistente, jev: null, critico: o.critico === true }
  let d = decidirRodada(entradas)
  let jev = null
  if (d.chama_jev) {
    jev = chamarJuiz(raiz, slug, man, { spec: o['spec-arquivo'], saidaChecks, critico: entradas.critico })
    entradas.jev = { exit: jev.exit, confianca: jev.confianca, probabilidades: jev.probabilidades, critico: jev.critico }
    d = decidirRodada(entradas)
  }

  // Aplica: mantém = commit com hooks; desfaz = patch salvo, reset e clean, só no worktree.
  let decisao = d.decisao, motivo = d.motivo, head = gitOk(raiz, 'rev-parse', 'HEAD')
  if (decisao === 'mantem') {
    const add = git(raiz, 'add', '-A', '--', ...caminhos)
    const c = add.status === 0 ? git(raiz, 'commit', '-q', '-m', `agent-loop ${slug} #${n}: ${hip.texto.split('\n')[0].slice(0, 80)}`) : add
    if (c.status !== 0) { decisao = 'desfaz'; motivo = `o commit falhou (hook?): ${(c.stderr || c.stdout).trim().split('\n')[0]}` }
    else head = gitOk(raiz, 'rev-parse', 'HEAD')
  }
  if (decisao === 'desfaz') {
    const novos = git(raiz, 'ls-files', '--others', '--exclude-standard').stdout.split('\n').filter((f) => f && !RUIDO.some((r) => f.startsWith(r)))
    const patch = git(raiz, 'diff', esperado || 'HEAD').stdout + novos.map((f) => sh('git', ['diff', '--no-index', '/dev/null', f], { cwd: raiz }).stdout).join('')
    mkdirSync(join(dirSlug(raiz, slug), 'descartadas'), { recursive: true })
    writeFileSync(join(dirSlug(raiz, slug), 'descartadas', `rodada-${n}.patch`), patch)
    gitOk(raiz, 'reset', '--hard', '-q', esperado || 'HEAD')
    gitOk(raiz, 'clean', '-fdq', '-e', 'graft/')
  }

  const m = limparPii(motivo)
  const linha = {
    n, branch, decisao, calculada: d.decisao, hipotese: hip.texto, pii_trocado: hip.trocou || m.trocou, motivo: m.texto,
    passam, passavam, falharam, total, guarda_ok, fora_do_escopo, hash_ok, sem_mudanca, commit_indevido,
    jev: jev ? { exit: jev.exit, veredito: jev.veredito, confianca: jev.confianca, probabilidades: jev.probabilidades, critico: jev.critico, cortado: jev.cortado } : null,
    segue: d.segue, estado: d.estado, head, ts: new Date().toISOString(),
  }
  anexar(raiz, slug, linha)
  const publicado = o.card ? publicar(raiz, slug, o.card) > 0 : false
  return { n, decisao, calculada: d.decisao, segue: decisao === d.decisao ? d.segue : 'segue', estado: decisao === d.decisao ? d.estado : null, motivo: m.texto, head, hash: hashAtual,
    script_sha: sha(readFileSync(ESTE)), entradas, jev, publicado }
}

function fechar(raiz, slug) {
  guardar(raiz); validarSlug(slug)
  const rs = lerRodadas(raiz, slug)
  const dir = dirSlug(raiz, slug)
  copyFileSync(arqRodadas(raiz, slug), join(dir, 'resultados.jsonl'))
  const mantidas = rs.filter((r) => r.decisao === 'mantem').length
  const ult = rs.filter((r) => r.decisao === 'mantem').pop()
  const rel = [`# agent-loop ${slug}`, '', `${rs.length} rodadas: ${mantidas} mantidas, ${rs.length - mantidas} desfeitas.`,
    `Nota final: ${ult ? `${ult.passam.length}/${ult.total}` : '0'} checks.`, '', '| # | decisão | checks | Jev | hipótese |', '|---|---|---|---|---|',
    ...rs.map((r) => `| ${r.n} | ${r.decisao === 'mantem' ? 'mantida' : 'desfeita'} | ${r.passam.length}/${r.total} | ${r.jev?.veredito ?? '—'} | ${String(r.hipotese).replace(/\|/g, '/')} |`), ''].join('\n')
  writeFileSync(join(dir, 'relatorio.md'), rel)
  gitOk(raiz, 'add', '-A', '--', `.agent-loop/${slug}/resultados.jsonl`, `.agent-loop/${slug}/relatorio.md`)
  gitOk(raiz, 'commit', '-q', '-m', `agent-loop ${slug}: fecha com o relatório`)
  return { slug, rodadas: rs.length, mantidas, head: gitOk(raiz, 'rev-parse', 'HEAD') }
}

function conferirHabitos(raiz) {
  const f = join(dirAL(raiz), 'program.md')
  const sem = (t) => { const b = bloco(t, 'como-trabalhar'); if (b === null) throw new Error('program.md sem o bloco como-trabalhar'); return t.replace(b, '<<como-trabalhar>>') }
  const antes = git(raiz, 'show', 'HEAD:.agent-loop/program.md')
  if (antes.status !== 0) throw new Error('program.md não está no HEAD')
  if (sem(readFileSync(f, 'utf8')) !== sem(antes.stdout)) throw new Error('algo fora do bloco Como trabalhar mudou no program.md: só esse bloco é dos hábitos')
  return { ok: true }
}

// ---------- CLI ----------
function opcoes(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`argumento inválido: ${argv[i]}`)
    const k = argv[i].slice(2)
    if (k === 'critico' || k === 'conferir') o[k] = true
    else { const v = argv[++i]; if (v === undefined) throw new Error(`falta o valor de --${k}`); o[k] = v }
  }
  return o
}

if (process.argv[1] && real(process.argv[1]) === real(ESTE)) {
  try {
    const [cmd, ...resto] = process.argv.slice(2)
    const o = opcoes(resto)
    const raiz = real(o.raiz ?? process.cwd())
    let saida
    if (cmd === 'travar') saida = travar(raiz, o.slug)
    else if (cmd === 'preflight') { validarSlug(o.slug); saida = preflight(raiz, o.slug, o.hash) }
    else if (cmd === 'rodada') saida = rodada(raiz, o)
    else if (cmd === 'publicar') { validarSlug(o.slug); if (!o.card) throw new Error('--card obrigatório'); saida = { publicados: publicar(raiz, o.slug, o.card) } }
    else if (cmd === 'fechar') saida = fechar(raiz, o.slug)
    else if (cmd === 'habitos') { if (!o.conferir) throw new Error('habitos só tem --conferir nesta versão'); saida = conferirHabitos(raiz) }
    else throw new Error('uso: agent-loop.mjs travar|preflight|rodada|publicar|fechar|habitos [opções]')
    process.stdout.write(JSON.stringify(saida, null, 2) + '\n')
  } catch (e) {
    process.stderr.write(`agent-loop: erro — ${e.message}\n`)
    process.exit(1)
  }
}

export { decidirRodada }
