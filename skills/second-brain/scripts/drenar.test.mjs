import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { anexarNaSecao, caminhoDoVault, drenar } from './drenar.mjs'

const vaultFalso = () => {
  const v = mkdtempSync(join(tmpdir(), 'vault-'))
  writeFileSync(join(v, 'AGENTS.md'), '# vault')
  mkdirSync(join(v, 'Memoria'), { recursive: true })
  writeFileSync(join(v, 'Memoria', 'log.md'), '')
  return v
}
const item = (fila, nome, o) => { mkdirSync(fila, { recursive: true }); writeFileSync(join(fila, nome), JSON.stringify(o)) }

test('a linha entra na seção certa; a seção que falta é criada no fim', () => {
  const t = '# log\n\n## Feito\n\n- a\n\n## Decisões\n\n- d1\n'
  assert.match(anexarNaSecao(t, 'Decisões', '- d2'), /## Decisões\n\n- d1\n- d2\n/)
  assert.match(anexarNaSecao(t, 'Propostas', '- p'), /## Propostas\n\n- p\n$/)
  assert.match(anexarNaSecao(t, 'Feito', '- b'), /## Feito\n\n- a\n- b\n\n## Decisões/)
})

test('o vault vem da variável; sem AGENTS.md, não é vault', () => {
  const v = vaultFalso()
  assert.equal(caminhoDoVault({ SECOND_BRAIN_PATH: v }), v)
  assert.equal(caminhoDoVault({ SECOND_BRAIN_PATH: tmpdir() }, () => false), null)
})

test('drenar grava no log do dia pela categoria, registra no log.md e tira da fila', () => {
  const v = vaultFalso(); const fila = mkdtempSync(join(tmpdir(), 'fila-'))
  item(fila, 'a.json', { categoria: 'preferencia', titulo: 'Testa em VM descartável', fatos: ['disse no turno'], narrativa: 'Antes de mudar skill.', data: '2026-09-26' })
  item(fila, 'b.json', { categoria: 'decisao', titulo: 'Estender a second-brain', fatos: [], narrativa: 'Em vez de criar outra.', data: '2026-09-26' })
  const r = drenar({ fila, vault: v, agora: new Date('2026-09-26T12:00:00') })
  assert.equal(r.gravados, 2)
  const log = readFileSync(join(v, 'Daily', 'logs', '2026-09-26.md'), 'utf8')
  assert.match(log, /tipo: daily-log/)
  assert.match(log, /## Propostas\n\n- \*\*Proposta \(preferencia\):\*\* Testa em VM descartável/)
  assert.match(log, /## Decisões\n\n- Estender a second-brain/)
  const jornal = readFileSync(join(v, 'Memoria', 'log.md'), 'utf8')
  assert.match(jornal, /· proposta · `Daily\/logs\/2026-09-26.md` · Testa em VM/)
  assert.equal(existsSync(join(fila, 'a.json')), false)
  assert.equal(existsSync(join(fila, 'feitos', 'a.json')), true)
})

test('sem vault, nada sai da fila', () => {
  const fila = mkdtempSync(join(tmpdir(), 'fila-'))
  item(fila, 'a.json', { categoria: 'decisao', titulo: 't', narrativa: 'n' })
  const r = drenar({ fila, vault: null })
  assert.match(r.erro, /vault não encontrado/)
  assert.equal(existsSync(join(fila, 'a.json')), true)
})
