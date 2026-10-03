import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALIAS, PREFERENCIA, comando, detectar, resolver } from './harnesses.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const MODULO = join(AQUI, 'harnesses.mjs')
const TODOS = ['claude', 'codex', 'cursor', 'grok']
const PAPEIS = ['scout', 'reach', 'implement', 'monitoring']
const hm = (r) => `${r.harness}:${r.modelo}`
const res = (papel, o = {}) => resolver(papel, { disponiveis: TODOS, env: {}, ...o })
const subconjuntos = (xs) => xs.reduce((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]])

// ---------- comando() ----------

test('grok: o briefing entra só por --prompt-file, nunca junto com -p (flags excludentes)', () => {
  const g = comando({ harness: 'grok', modelo: 'grok-4.7' }, 'implement')
  assert.deepEqual(g, ['grok', '-m', 'grok-4.7', '--always-approve', '--prompt-file', '{briefing}'])
  assert.ok(!g.includes('-p') && !g.includes('--single'))
})

test('codex: scout só lê; monitoring escreve no workspace e tem rede para a verificação e o juiz', () => {
  const s = comando({ harness: 'codex', modelo: 'gpt-6-luna', esforco: 'medium' }, 'scout')
  assert.deepEqual(s, ['codex', 'exec', '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort=medium', '-s', 'read-only', '--skip-git-repo-check', '-', '<', '{briefing}'])
  const m = comando({ harness: 'codex', modelo: 'gpt-6-sol', esforco: 'max' }, 'monitoring')
  assert.ok(m.includes('workspace-write'))
  assert.ok(m.includes('sandbox_workspace_write.network_access=true'))
  const i = comando({ harness: 'codex', modelo: 'gpt-6-luna', esforco: 'xhigh' }, 'implement')
  assert.ok(i.includes('workspace-write') && !i.includes('sandbox_workspace_write.network_access=true'))
})

test('cursor: scout e reach em modo ask; implement e monitoring com --force', () => {
  for (const papel of ['scout', 'reach']) {
    const c = comando({ harness: 'cursor', modelo: 'composer-2.5' }, papel)
    assert.ok(c.includes('--mode') && c.includes('ask') && !c.includes('--force'), papel)
  }
  for (const papel of ['implement', 'monitoring']) {
    const c = comando({ harness: 'cursor', modelo: 'grok-4.7-high' }, papel)
    assert.ok(c.includes('--force') && !c.includes('ask'), papel)
  }
})

test('claude nativo não tem comando: o agente faz o trabalho', () => {
  assert.equal(comando({ harness: 'claude', modelo: 'claude-opus-5-5' }, 'reach'), null)
})

test('claude não nativo: claude -p --agent <papel> --model, com o sandbox do papel', () => {
  const c = { harness: 'claude', modelo: 'claude-fable-5-1', esforco: 'high' }
  for (const papel of ['scout', 'reach']) {
    const x = comando(c, papel, false)
    assert.deepEqual(x.slice(0, 7), ['claude', '-p', '--agent', papel, '--model', 'fable', '--effort'])
    assert.equal(x[x.indexOf('--permission-mode') + 1], 'plan', papel)
    assert.ok(x.includes('--permission-prompts') && x.includes('none'))
  }
  const i = comando({ harness: 'claude', modelo: 'claude-sonnet-5-5', esforco: null }, 'implement', false)
  assert.equal(i[i.indexOf('--permission-mode') + 1], 'acceptEdits')
  assert.ok(i.includes('--agent') && i.includes('--model') && !i.includes('--effort'))
  const m = comando(c, 'monitoring', false)
  assert.equal(m[m.indexOf('--permission-mode') + 1], 'dontAsk')
  assert.ok(!m.join(' ').match(/\b(Edit|Write)\b/))
  assert.deepEqual(m.slice(-2), ['<', '{briefing}'])
})

// ---------- resolver() ----------

test('scout, todos os harnesses, aqui no Haiku: vai para o Luna no Codex, só leitura', () => {
  const r = res('scout', { aqui: 'claude:claude-haiku-4-5' })
  assert.equal(hm(r), 'codex:gpt-6-luna')
  assert.equal(r.nativo, false)
  assert.ok(r.comando.includes('read-only'))
  assert.deepEqual(r.caiu, [])
  assert.equal(r.aviso, null)
})

test('reach no Opus é nativo; com --escalada vira o Fable pela CLI do claude', () => {
  const n = res('reach', { aqui: 'claude:claude-opus-5-5' })
  assert.equal(hm(n), 'claude:claude-opus-5-5')
  assert.equal(n.nativo, true)
  assert.equal(n.comando, null)
  const e = res('reach', { aqui: 'claude:claude-opus-5-5', escalada: true })
  assert.equal(hm(e), 'claude:claude-fable-5-1')
  assert.equal(e.nativo, false)
  assert.deepEqual(e.comando.slice(0, 4), ['claude', '-p', '--agent', 'reach'])
  const f = res('reach', { aqui: 'claude:claude-fable-5-1', escalada: true })
  assert.equal(f.nativo, true)
})

test('implement: Grok no Cursor; excluído, o Grok pela CLI própria', () => {
  assert.equal(hm(res('implement')), 'cursor:grok-4.7-high')
  assert.equal(hm(res('implement', { excluir: ['cursor:grok-4.7-high'] })), 'grok:grok-4.7')
})

test('falha dos dois Groks: o Sol constrói e o Fable confere (a antiga reserva)', () => {
  const imp = res('implement', { excluir: ['cursor:grok-4.7-high', 'grok:grok-4.7'] })
  assert.equal(hm(imp), 'codex:gpt-6-sol')
  assert.ok(imp.comando.includes('workspace-write'))
  assert.equal(hm(res('monitoring', { construtor: hm(imp) })), 'claude:claude-fable-5-1')
})

test('implement só com claude+codex: Sol; só codex: Luna (o Sol exige o Claude)', () => {
  assert.equal(hm(res('implement', { disponiveis: ['claude', 'codex'] })), 'codex:gpt-6-sol')
  assert.equal(hm(res('implement', { disponiveis: ['codex'] })), 'codex:gpt-6-luna')
})

test('PAPEIS_SO restringe: só codex, só cursor, só claude', () => {
  const so = (h, papel, o = {}) => hm(res(papel, { env: { PAPEIS_SO: h }, ...o }))
  assert.equal(so('codex', 'scout'), 'codex:gpt-6-luna')
  assert.equal(so('codex', 'reach'), 'codex:gpt-6-astra')
  assert.equal(so('codex', 'implement'), 'codex:gpt-6-luna')
  assert.equal(so('codex', 'monitoring', { construtor: 'codex:gpt-6-luna' }), 'codex:gpt-6-sol')
  assert.equal(so('cursor', 'implement'), 'cursor:composer-2.5')
  assert.equal(so('cursor', 'monitoring', { construtor: 'cursor:composer-2.5' }), 'cursor:grok-4.7-high')
  const r = res('scout', { aqui: 'claude:claude-haiku-4-5', env: { PAPEIS_SO: 'claude' } })
  assert.equal(hm(r), 'claude:claude-haiku-4-5')
  assert.equal(r.nativo, true)
  assert.deepEqual(r.caiu, ['codex (fora de PAPEIS_SO)', 'cursor (fora de PAPEIS_SO)'])
})

test('monitoring: outro provedor que o construtor, o par declarado, e o mesmo provedor só com aviso', () => {
  assert.equal(hm(res('monitoring', { construtor: 'cursor:grok-4.7-high' })), 'codex:gpt-6-sol')
  assert.equal(hm(res('monitoring', { construtor: 'codex:gpt-6-sol' })), 'claude:claude-fable-5-1')
  const m = res('monitoring', { disponiveis: ['claude'], construtor: 'claude:claude-sonnet-5-5' })
  assert.equal(hm(m), 'claude:claude-opus-5-5')
  assert.match(m.aviso, /mesmo provedor/)
  assert.match(res('monitoring').aviso, /sem construtor/)
})

test('harness ausente, papel desconhecido e PAPEIS_SO não instalado são erro alto', () => {
  assert.throws(() => res('scout', { disponiveis: ['claude'], env: { PAPEIS_SO: 'codex' } }), /não instalado/)
  assert.throws(() => res('scout', { env: { PAPEIS_SO: 'gemini' } }), /desconhecido/)
  assert.throws(() => res('cozinheiro'), /desconhecido/)
  assert.throws(() => res('scout', { disponiveis: ['grok'] }), /nenhum/)
})

test('PAPEL_DESTINO=1: nativo, sem consultar a tabela', () => {
  const r = resolver('scout', { aqui: 'claude:claude-haiku-4-5', env: { PAPEL_DESTINO: '1' }, disponiveis: () => { throw new Error('não deveria detectar') } })
  assert.equal(r.nativo, true)
  assert.equal(r.comando, null)
})

test('invariante 1: com o Claude presente, nenhum papel falha em nenhum subconjunto', () => {
  for (const papel of PAPEIS) {
    const frontmatter = readFileSync(join(AQUI, '..', 'claude', 'agents', `${papel}.md`), 'utf8').match(/^model: (\w+)$/m)[1]
    const modelo = Object.entries(ALIAS).find(([, a]) => a === frontmatter)[0]
    for (const sub of subconjuntos(['codex', 'cursor', 'grok'])) {
      assert.doesNotThrow(() => res(papel, { disponiveis: ['claude', ...sub], aqui: `claude:${modelo}` }), `${papel} com ${sub}`)
    }
  }
})

test('invariante 2: o monitoring nunca sai com o modelo do construtor', () => {
  const construtores = PREFERENCIA.implement.map((c) => hm(c))
  for (const construtor of construtores) {
    for (const sub of subconjuntos(['codex', 'cursor', 'grok'])) {
      const m = res('monitoring', { disponiveis: ['claude', ...sub], construtor })
      assert.notEqual(m.modelo, construtor.split(':')[1], `${construtor} com ${sub}`)
    }
  }
})

// ---------- a tabela ----------

test('invariante 3: toda lista tem um candidato claude', () => {
  for (const papel of PAPEIS) assert.ok(PREFERENCIA[papel].some((c) => c.harness === 'claude'), papel)
})

test('invariante 4: scout e reach não têm candidato na CLI do grok (ela não tem modo só-leitura)', () => {
  for (const papel of ['scout', 'reach']) assert.ok(!PREFERENCIA[papel].some((c) => c.harness === 'grok'), papel)
})

test('invariante 5: model e effort do frontmatter de cada agente batem com o primeiro candidato claude', () => {
  for (const papel of PAPEIS) {
    const fm = readFileSync(join(AQUI, '..', 'claude', 'agents', `${papel}.md`), 'utf8').split('---')[1]
    const model = fm.match(/^model: (.+)$/m)[1]
    const effort = fm.match(/^effort: (.+)$/m)?.[1]
    const c = PREFERENCIA[papel].find((x) => x.harness === 'claude')
    assert.equal(model, ALIAS[c.modelo], papel)
    if (c.esforco) assert.equal(effort, c.esforco, papel)
  }
})

test('o Cursor é detectado por cursor-agent, não por agent', () => {
  assert.deepEqual(detectar((bin) => ['agent', 'claude'].includes(bin)), ['claude'])
})

test('todo modelo do Cursor na tabela existe na lista do Cursor (cursor-agent --list-models, 27/09/2026)', () => {
  const LISTA = ['composer-2.5', 'grok-4.7-low', 'grok-4.7-medium', 'grok-4.7-high', 'grok-4.7-xhigh']
  const doCursor = Object.values(PREFERENCIA).flat().filter((c) => c.harness === 'cursor').map((c) => c.modelo)
  for (const m of doCursor) assert.ok(LISTA.includes(m), `${m} não está na lista do Cursor`)
})

// ---------- rodar(), pela CLI, com binários falsos ----------

function ambiente(falsos) {
  const dir = mkdtempSync(join(tmpdir(), 'papeis-'))
  const bin = join(dir, 'bin'), repo = join(dir, 'repo')
  spawnSync('mkdir', ['-p', bin, repo])
  for (const [nome, corpo] of Object.entries(falsos)) {
    writeFileSync(join(bin, nome), `#!/bin/sh\n${corpo}\n`)
    chmodSync(join(bin, nome), 0o755)
  }
  const git = (...a) => spawnSync('git', a, { cwd: repo })
  git('init', '-q'); git('config', 'user.email', 'a@b'); git('config', 'user.name', 'a')
  writeFileSync(join(repo, 'base.txt'), 'x'); git('add', '.'); git('commit', '-qm', 'base')
  const out = join(dir, 'out')
  const rodar = (papel, args, briefing = 'faça X') => {
    const r = spawnSync(process.execPath, [MODULO, 'rodar', papel, ...args, '--briefing', '-', '--cwd', repo], {
      input: briefing, encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin`, FAKE_OUT: out, HOME: dir },
    })
    return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null }
  }
  return { rodar, out, repo }
}

test('rodar: o codex falso sai com 1, cai para o próximo; o escolhido tem exit 0 e a prova', () => {
  const { rodar } = ambiente({ codex: 'echo falhou >&2; exit 1', 'cursor-agent': 'echo ok-cursor' })
  const r = rodar('scout', ['--aqui', 'claude:claude-haiku-4-5'])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(hm(r.json), 'cursor:composer-2.5')
  assert.ok(r.json.caiu.some((c) => c.startsWith('codex:gpt-6-luna') && c.includes('exit 1')), JSON.stringify(r.json.caiu))
  assert.equal(r.json.execucao.exit, 0)
  assert.match(r.json.execucao.fim_da_saida, /ok-cursor/)
  assert.ok(existsSync(r.json.execucao.log))
})

test('rodar: o filho recebe PAPEL_DESTINO=1 e o briefing abre com a linha PAPEL_DESTINO', () => {
  const { rodar, out } = ambiente({ codex: 'echo "$PAPEL_DESTINO" > "$FAKE_OUT.env"; cat > "$FAKE_OUT.in"; echo feito' })
  const r = rodar('scout', ['--aqui', 'claude:claude-haiku-4-5'])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readFileSync(`${out}.env`, 'utf8').trim(), '1')
  const briefing = readFileSync(`${out}.in`, 'utf8')
  assert.ok(briefing.startsWith('PAPEL_DESTINO: você é o destino do papel scout; faça o trabalho, não redespache.'))
  assert.ok(briefing.includes('faça X'))
})

test('rodar: implement que escreveu e falhou NÃO cai: devolve falha_harness', () => {
  const { rodar, repo } = ambiente({ 'cursor-agent': 'echo meio > novo.txt; exit 1', codex: 'echo nao-deveria-rodar; exit 0' })
  const r = rodar('implement', ['--aqui', 'claude:claude-sonnet-5-5'])
  assert.equal(r.status, 1)
  assert.equal(r.json.falha_harness, true)
  assert.ok(existsSync(join(repo, 'novo.txt')))
  assert.ok(!JSON.stringify(r.json).includes('nao-deveria-rodar'))
})

test('rodar: implement que falhou sem escrever cai para o próximo', () => {
  const { rodar } = ambiente({ 'cursor-agent': 'exit 1', grok: 'echo grok-ok' })
  const r = rodar('implement', ['--aqui', 'claude:claude-sonnet-5-5'])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(hm(r.json), 'grok:grok-4.7')
})

test('rodar: teto estourado mata o filho e conta como falha', () => {
  const { rodar } = ambiente({ codex: 'exec sleep 5', 'cursor-agent': 'echo ok-cursor' })
  const r = rodar('scout', ['--aqui', 'claude:claude-haiku-4-5', '--teto', '0.01'])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(hm(r.json), 'cursor:composer-2.5')
  assert.ok(r.json.caiu.some((c) => c.includes('timeout')), JSON.stringify(r.json.caiu))
})

test('rodar: caiu até o Claude nativo devolve nativo:true com caiu preenchido', () => {
  const { rodar } = ambiente({ codex: 'exit 1', 'cursor-agent': 'exit 1' })
  const r = rodar('scout', ['--aqui', 'claude:claude-haiku-4-5'])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.nativo, true)
  assert.equal(r.json.harness, 'claude')
  assert.equal(r.json.caiu.length, 2)
})

test('rodar: implement que já começou sujo, alterou o arquivo e falhou NÃO cai', () => {
  const { rodar, repo } = ambiente({ 'cursor-agent': 'echo mais >> base.txt; exit 1', grok: 'echo nao-deveria-rodar' })
  writeFileSync(join(repo, 'base.txt'), 'sujo antes')
  const r = rodar('implement', ['--aqui', 'claude:claude-sonnet-5-5'])
  assert.equal(r.status, 1)
  assert.equal(r.json.falha_harness, true)
})

test('monitoring: o par declarado (Fable) excluído cai para o Opus e fica em caiu', () => {
  const m = res('monitoring', { construtor: 'codex:gpt-6-sol', excluir: ['claude:claude-fable-5-1'] })
  assert.equal(hm(m), 'claude:claude-opus-5-5')
  assert.ok(m.caiu.some((c) => c.startsWith('claude:claude-fable-5-1') && c.includes('falhou nesta rodada')), JSON.stringify(m.caiu))
})
