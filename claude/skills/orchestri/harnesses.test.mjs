import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comando, detectar, planejar } from './harnesses.mjs'

const TODOS = ['claude', 'codex', 'cursor', 'grok']
const resumo = (p) => Object.fromEntries(Object.entries(p.papeis).map(([k, v]) => [k, `${v.harness}:${v.modelo}`]))

test('todos os harnesses: Luna pesado, Opus planeja, Grok (no Cursor) executa, Sol monitora', () => {
  const p = planejar(TODOS)
  assert.deepEqual(resumo(p), {
    scout: 'codex:gpt-6-luna', reach: 'claude:claude-opus-5-5', implement: 'cursor:grok-4.7-high', monitoring: 'codex:gpt-6-sol',
  })
  assert.equal(p.papeis.reach.escalada, 'claude-fable-5-1')
  assert.deepEqual(p.avisos, [])
})

test('--claude: os quatro papéis no Claude Code, monitoring acima do implement', () => {
  const p = planejar(TODOS, ['claude'])
  assert.deepEqual(resumo(p), {
    scout: 'claude:claude-haiku-4-5', reach: 'claude:claude-opus-5-5', implement: 'claude:claude-sonnet-5', monitoring: 'claude:claude-opus-5-5',
  })
  assert.equal(p.papeis.scout.comando, null)
  assert.ok(p.avisos.some((a) => a.includes('mesmo provedor')))
})

test('--codex: a tabela do Codex', () => {
  assert.deepEqual(resumo(planejar(TODOS, ['codex'])), {
    scout: 'codex:gpt-6-luna', reach: 'codex:gpt-6-astra', implement: 'codex:gpt-6-luna', monitoring: 'codex:gpt-6-sol',
  })
})

test('--cursor: Composer constrói, Grok 4.7 confere', () => {
  assert.deepEqual(resumo(planejar(TODOS, ['cursor'])), {
    scout: 'cursor:composer-2.5', reach: 'cursor:grok-4.7-high', implement: 'cursor:composer-2.5', monitoring: 'cursor:grok-4.7-high',
  })
})

test('sem o Grok (nem Cursor nem CLI): o Sol implementa e o Fable confere', () => {
  const p = planejar(['claude', 'codex'])
  assert.equal(`${p.papeis.implement.harness}:${p.papeis.implement.modelo}`, 'codex:gpt-6-sol')
  assert.equal(`${p.papeis.monitoring.harness}:${p.papeis.monitoring.modelo}`, 'claude:claude-fable-5-1')
  assert.ok(p.papeis.implement.comando.includes('workspace-write'))
  assert.equal(p.papeis.implement.monitoring, undefined)
  assert.equal(p.reserva, null)
})

test('com o Grok, a reserva para falha na hora é o par Sol + Fable', () => {
  const p = planejar(TODOS)
  assert.equal(p.reserva.implement.modelo, 'gpt-6-sol')
  assert.equal(p.reserva.monitoring.modelo, 'claude-fable-5-1')
  assert.equal(p.reserva.monitoring.comando, null)
})

test('o par Sol + Fable exige o Claude: --codex continua Luna constrói, Sol confere', () => {
  const p = planejar(TODOS, ['codex'])
  assert.equal(p.papeis.implement.modelo, 'gpt-6-luna')
  assert.equal(p.papeis.monitoring.modelo, 'gpt-6-sol')
  assert.equal(p.reserva, null)
})

test('sem o Cursor, o Grok 4.7 roda pela CLI própria', () => {
  const p = planejar(['claude', 'codex', 'grok'])
  assert.equal(`${p.papeis.implement.harness}:${p.papeis.implement.modelo}`, 'grok:grok-4.7')
  assert.equal(p.papeis.monitoring.modelo, 'gpt-6-sol')
})

test('--cursor: o Grok não constrói sem quem o confira — Composer constrói, Grok 4.7 confere', () => {
  const p = planejar(TODOS, ['cursor'])
  assert.equal(p.papeis.implement.modelo, 'composer-2.5')
  assert.equal(p.papeis.monitoring.modelo, 'grok-4.7-high')
})

test('sem Claude e sem Grok: Sol não entra sem o Fable; o implement cai para o Composer', () => {
  const p = planejar(['codex', 'cursor'].filter(Boolean))
  assert.notEqual(p.papeis.implement.modelo, 'gpt-6-sol')
})

test('monitoring nunca é do provedor do implement quando há outro', () => {
  const p = planejar(['claude', 'grok'])
  assert.equal(p.papeis.implement.provedor, 'xai')
  assert.equal(p.papeis.monitoring.provedor, 'anthropic')
})

test('harness pedido e não instalado é erro alto', () => {
  assert.throws(() => planejar(['claude'], ['codex']), /não instalado/)
  assert.throws(() => planejar(TODOS, ['gemini']), /desconhecido/)
})

test('só o Grok não fecha os quatro papéis', () => {
  assert.throws(() => planejar(TODOS, ['grok']), /papel scout/)
})

test('o Cursor é detectado por cursor-agent, não por agent', () => {
  const achados = detectar((bin) => ['agent', 'claude'].includes(bin))
  assert.deepEqual(achados, ['claude'])
})

test('comando do implement externo pode escrever; scout só lê', () => {
  const p = planejar(TODOS)
  assert.ok(p.papeis.implement.comando.includes('--force'))
  assert.ok(p.papeis.scout.comando.includes('read-only'))
})

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

test('claude não tem comando: roda como subagente nativo', () => {
  assert.equal(comando({ harness: 'claude', modelo: 'claude-opus-5-5' }, 'reach'), null)
})

test('orchestri.js carrega o mesmo bloco <plano> de harnesses.mjs (rode sincronizar.mjs ao mudar)', async () => {
  const { esperado, atual } = await import('./sincronizar.mjs')
  assert.equal(atual(), esperado())
})

test('todo modelo do Cursor no plano existe na lista do Cursor (cursor-agent --list-models, 27/09/2026)', async () => {
  const { PREFERENCIA } = await import('./harnesses.mjs')
  const LISTA = ['composer-2.5', 'grok-4.7-low', 'grok-4.7-medium', 'grok-4.7-high', 'grok-4.7-xhigh']
  const doCursor = Object.values(PREFERENCIA).flat().filter((c) => c.harness === 'cursor').map((c) => c.modelo)
  for (const m of doCursor) assert.ok(LISTA.includes(m), `${m} não está na lista do Cursor`)
})
