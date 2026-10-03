#!/usr/bin/env node
// A tabela de harness e modelo por papel (scout, reach, implement, monitoring), num arquivo só.
// Instalada em ~/.agents/papeis (o install.sh liga); os quatro agentes de claude/agents/ a leem antes de
// trabalhar, e as `agent-models` do Codex e do Cursor apontam para cá. Spec: specs/harness-por-agente.md.
//
// CLI:
//   node harnesses.mjs resolver <papel> --aqui <harness>[:<modelo>] [--construtor h:m] [--excluir h:m,...] [--escalada]
//   node harnesses.mjs rodar <papel> --aqui ... --briefing <arquivo | -> [--teto <min, padrão 30>] [--cwd <dir>]
//   node harnesses.mjs --disponiveis
// Restringir harness: PAPEIS_SO=claude,codex no ambiente.
//
// Lições que sobrevivem da antiga /orchestri:
// - A ponte prova a execução (comando, exit, fim da saída) e NUNCA faz o trabalho no lugar do harness.
//   O encanamento em prosa saiu errado em 27/09/2026; por isso a linha de CLI e o fallback são código com teste.
// - O Cursor é `cursor-agent`, nunca `agent`: o Grok instala um `agent` próprio.
// - No Grok, --prompt-file e -p são excludentes: o briefing entra só pelo arquivo.
// - O ID do Grok no Cursor é `grok-4.7-high` (o Cursor não lista "grok-4.7" puro).
// - Harness e modelo são desta tabela; falha de runner não é lacuna de spec.
// - CLI externa que escreve ou tem rede precisa de permissão liberada na sessão: a regra de allow é
//   `node ~/.agents/papeis/harnesses.mjs rodar` (README, "Instalar").
import { execFileSync, spawnSync } from 'node:child_process'
import { realpathSync, readFileSync, writeFileSync, mkdtempSync, openSync, closeSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// O binário de cada harness. O Cursor é `cursor-agent`, nunca `agent`: o Grok instala um `agent` próprio.
export const HARNESSES = {
  claude: { bin: 'claude' },
  codex: { bin: 'codex' },
  cursor: { bin: 'cursor-agent' },
  grok: { bin: 'grok' },
}

// Preferência por papel: o primeiro candidato com harness permitido e disponível ganha.
export const PREFERENCIA = {
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
    { harness: 'claude', modelo: 'claude-opus-5-5', escalada: 'claude-fable-5-1', esforco: 'high', provedor: 'anthropic' },
    { harness: 'cursor', modelo: 'grok-4.7-high', esforco: null, provedor: 'xai' },
  ],
}

export const ALIAS = {
  'claude-haiku-4-5': 'haiku',
  'claude-sonnet-5-5': 'sonnet',
  'claude-opus-5-5': 'opus',
  'claude-fable-5-1': 'fable',
}

const PAPEL_DESTINO = (papel) => `PAPEL_DESTINO: você é o destino do papel ${papel}; faça o trabalho, não redespache.`

// O comando sem tela de cada harness externo. O briefing entra por arquivo ({briefing}).
// Claude nativo não tem comando: o próprio agente faz o trabalho. Claude não nativo (outro modelo) vai por `claude -p`.
// Scout e reach só leem. O implement escreve. O monitoring roda a verificação e o juiz — precisa de
// shell, tmp e rede —, e "não conserta" é regra do prompt dele, não do sandbox.
export function comando(c, papel, nativo = true) {
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
    case 'claude': {
      if (nativo) return null
      const modo = escreve ? ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash']
        : papel === 'monitoring' ? ['--permission-mode', 'dontAsk', '--allowedTools', 'Read Grep Glob Bash']
        : ['--permission-mode', 'plan']
      return ['claude', '-p', '--agent', papel, '--model', ALIAS[c.modelo] ?? c.modelo,
        ...(c.esforco ? ['--effort', c.esforco] : []), ...modo, '--permission-prompts', 'none', '<', '{briefing}']
    }
    default:
      return null
  }
}

export function detectar(existe = (bin) => { try { execFileSync('/bin/sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' }); return true } catch { return false } }) {
  return Object.keys(HARNESSES).filter((h) => existe(HARNESSES[h].bin))
}

const par = (s) => {
  if (!s) return null
  const i = s.indexOf(':')
  return i < 0 ? { harness: s, modelo: null } : { harness: s.slice(0, i), modelo: s.slice(i + 1) }
}
const chave = (c) => `${c.harness}:${c.modelo}`

// Escolhe o candidato do papel. Pula, registrando o motivo em `caiu`: harness ausente ou fora de PAPEIS_SO,
// falhou nesta rodada, `requer` não atendido, implement sem quem o confira, monitoring com o modelo do construtor.
export function resolver(papel, o = {}) {
  if (!PREFERENCIA[papel]) throw new Error(`papel desconhecido: ${papel}`)
  const env = o.env ?? process.env
  const aqui = par(o.aqui)
  if (env.PAPEL_DESTINO === '1') {
    return { papel, harness: aqui?.harness ?? null, modelo: aqui?.modelo ?? null, esforco: null, provedor: null, nativo: true, comando: null, caiu: [], aviso: null }
  }
  const instalados = [...(typeof o.disponiveis === 'function' ? o.disponiveis() : o.disponiveis ?? detectar())]
  if (aqui && !instalados.includes(aqui.harness) && HARNESSES[aqui.harness]) instalados.push(aqui.harness) // quem roda aqui existe
  const so = o.so ?? (env.PAPEIS_SO ? env.PAPEIS_SO.split(',').map((h) => h.trim()).filter(Boolean) : [])
  const desconhecidos = so.filter((h) => !HARNESSES[h])
  if (desconhecidos.length) throw new Error(`harness desconhecido: ${desconhecidos.join(', ')}`)
  const ausentes = so.filter((h) => !instalados.includes(h))
  if (ausentes.length) throw new Error(`harness pedido e não instalado: ${ausentes.join(', ')}`)
  const permitidos = so.length ? so : instalados
  const excluir = o.excluir ?? []
  const construtor = par(o.construtor)
  const lista = (p) => PREFERENCIA[p].map((c) => (o.escalada && (p === 'reach' || p === 'monitoring') && c.escalada ? { ...c, modelo: c.escalada } : c))

  const motivo = (c) => {
    if (!permitidos.includes(c.harness)) return so.length && instalados.includes(c.harness) ? 'fora de PAPEIS_SO' : 'ausente'
    if (excluir.includes(chave(c))) return 'falhou nesta rodada'
    if (c.requer && !permitidos.includes(c.requer)) return `requer ${c.requer}`
    return null
  }
  const usaveis = (p) => lista(p).filter((c) => !motivo(c))
  const provedorDe = (x) => Object.values(PREFERENCIA).flat().find((c) => c.harness === x.harness && c.modelo === x.modelo)?.provedor ?? null

  // Quem confere o construtor: o par declarado, depois outro provedor, depois outro modelo (com aviso).
  const conferente = (cons) => {
    if (!cons) { const c = usaveis('monitoring')[0]; return c ? { c, aviso: 'sem construtor: provedor não conferido' } : null }
    const decl = Object.values(PREFERENCIA).flat().find((c) => c.harness === cons.harness && c.modelo === cons.modelo)?.monitoring
    if (decl && !motivo(decl) && decl.modelo !== cons.modelo) return { c: decl, aviso: null }
    const prov = provedorDe(cons)
    const outro = usaveis('monitoring').find((c) => c.provedor !== prov)
    if (outro) return { c: outro, aviso: null }
    const mesmo = usaveis('monitoring').find((c) => c.modelo !== cons.modelo)
    return mesmo ? { c: mesmo, aviso: `monitoring (${mesmo.modelo}) é do mesmo provedor que o construtor (${cons.modelo}): só há um provedor permitido` } : null
  }

  const caiu = []
  let escolhido = null, aviso = null
  if (papel === 'monitoring') {
    const r = conferente(construtor)
    if (r) { escolhido = r.c; aviso = r.aviso }
    const decl = construtor && Object.values(PREFERENCIA).flat().find((c) => c.harness === construtor.harness && c.modelo === construtor.modelo)?.monitoring
    const declMotivo = decl && motivo(decl)
    if (declMotivo) caiu.push(declMotivo === 'ausente' || declMotivo.startsWith('fora') ? `${decl.harness} (${declMotivo})` : `${chave(decl)} (${declMotivo})`)
    for (const c of lista(papel)) {
      if (escolhido && chave(c) === chave(escolhido)) break
      const m = motivo(c) ?? (construtor && c.modelo === construtor.modelo ? 'mesmo modelo do construtor' : 'preferência: outro provedor que o construtor')
      caiu.push(m === 'ausente' || m.startsWith('fora') ? `${c.harness} (${m})` : `${chave(c)} (${m})`)
    }
  } else {
    for (const c of lista(papel)) {
      let m = motivo(c)
      if (!m && papel === 'implement' && !conferente(c)) m = 'sem monitoring que o confira'
      if (m) { caiu.push(m === 'ausente' || m.startsWith('fora') ? `${c.harness} (${m})` : `${chave(c)} (${m})`); continue }
      escolhido = c
      break
    }
  }
  if (!escolhido) throw new Error(`nenhum candidato roda o papel ${papel}: ${caiu.join(', ') || 'lista vazia'}`)
  const nativo = !!aqui && aqui.harness === escolhido.harness && (!aqui.modelo || aqui.modelo === escolhido.modelo)
  const { monitoring, requer, escalada, ...resto } = escolhido
  return { papel, ...resto, nativo, comando: nativo ? null : comando(escolhido, papel, false), caiu, aviso }
}

const aspas = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
const emShell = (cmd, briefing) => 'exec ' + cmd.map((t) => {
  if (t === '<') return '<'
  if (t.includes('{briefing}') && t.includes('$(')) return t.replace('{briefing}', aspas(briefing))
  return t === '{briefing}' ? aspas(briefing) : aspas(t)
}).join(' ')
// A árvore como está: a lista do porcelain mais o hash do conteúdo de cada arquivo sujo, para pegar
// escrita em arquivo que já começou sujo (o porcelain, sozinho, não muda).
const porcelain = (cwd) => {
  const lista = spawnSync('git', ['status', '--porcelain', '-z', '-uall'], { cwd, encoding: 'utf8' }).stdout ?? ''
  const hashes = lista.split('\0').filter(Boolean).map((l) => {
    const f = l.slice(3)
    try { return `${f}:${createHash('sha1').update(readFileSync(join(cwd, f))).digest('hex')}` } catch { return `${f}:ausente` }
  })
  return `${lista}\n${hashes.join('\n')}`
}

// A ponte: resolve, executa a CLI do harness escolhido e prova. Cai para o próximo candidato quando falha.
export function rodar(papel, o = {}) {
  const dir = mkdtempSync(join(tmpdir(), `papel-${papel}-`))
  const briefingPath = join(dir, 'briefing.md')
  writeFileSync(briefingPath, `${PAPEL_DESTINO(papel)}\n\n${o.briefing ?? ''}`)
  const cwd = o.cwd ?? process.cwd()
  const teto = (o.teto ?? 30) * 60_000
  const excluir = [...(o.excluir ?? [])]
  const motivos = new Map()
  const detalhar = (caiu) => caiu.map((c) => {
    const k = [...motivos.keys()].find((x) => c.startsWith(`${x} (falhou nesta rodada)`))
    return k ? `${k} (${motivos.get(k)})` : c
  })
  for (;;) {
    const r = resolver(papel, { ...o, excluir })
    r.caiu = detalhar(r.caiu)
    if (r.nativo) return r
    const antes = papel === 'implement' ? porcelain(cwd) : null
    const log = join(dir, `${r.harness}-${excluir.length}.log`)
    const fd = openSync(log, 'w')
    const p = spawnSync('/bin/sh', ['-c', emShell(r.comando, briefingPath)], {
      cwd, stdio: ['ignore', fd, fd], timeout: teto, killSignal: 'SIGKILL', env: { ...process.env, PAPEL_DESTINO: '1' },
    })
    closeSync(fd)
    const saida = readFileSync(log, 'utf8')
    const exit = p.status ?? -1
    const falha = p.error?.code === 'ETIMEDOUT' || p.signal === 'SIGKILL' ? 'timeout' : exit !== 0 ? `exit ${exit}` : !saida.trim() ? 'saída vazia' : null
    const execucao = { comando: r.comando.join(' '), exit, log, fim_da_saida: saida.split('\n').slice(-40).join('\n').trim() }
    if (!falha) return { ...r, execucao }
    if (papel === 'implement' && porcelain(cwd) !== antes) return { ...r, falha_harness: true, motivo: falha, execucao }
    motivos.set(chave(r), falha)
    excluir.push(chave(r))
  }
}

function opcoes(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) throw new Error(`argumento inválido: ${a}`)
    const k = a.slice(2)
    if (k === 'escalada') { o.escalada = true; continue }
    const v = argv[++i]
    if (v === undefined) throw new Error(`falta o valor de ${a}`)
    if (k === 'excluir') o.excluir = v.split(',').filter(Boolean)
    else if (k === 'teto') o.teto = Number(v)
    else if (['aqui', 'construtor', 'briefing', 'cwd'].includes(k)) o[k] = v
    else throw new Error(`opção desconhecida: ${a}`)
  }
  return o
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [cmd, ...resto] = process.argv.slice(2)
    if (cmd === '--disponiveis') { process.stdout.write(JSON.stringify(detectar()) + '\n'); process.exit(0) }
    if (!['resolver', 'rodar'].includes(cmd)) throw new Error('uso: harnesses.mjs resolver|rodar <papel> [opções] | --disponiveis')
    const [papel, ...flags] = resto
    const o = opcoes(flags)
    if (cmd === 'resolver') { process.stdout.write(JSON.stringify(resolver(papel, o), null, 2) + '\n'); process.exit(0) }
    if (!o.briefing) throw new Error('rodar exige --briefing <arquivo | ->')
    o.briefing = readFileSync(o.briefing === '-' ? 0 : o.briefing, 'utf8')
    const r = rodar(papel, o)
    process.stdout.write(JSON.stringify(r, null, 2) + '\n')
    process.exit(r.falha_harness ? 1 : 0)
  } catch (e) {
    process.stderr.write(`harnesses: erro — ${e.message}\n`)
    process.exit(1)
  }
}
