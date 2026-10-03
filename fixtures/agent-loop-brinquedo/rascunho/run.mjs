// Checks do brinquedo, em TAP. Rodam na raiz do worktree: `node .agent-loop/estat/checks/run.mjs`.
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const carrega = async (rel) => { try { return await import(pathToFileURL(resolve(rel)).href) } catch { return null } }
const est = await carrega('src/estatistica.mjs')
const idx = await carrega('src/index.mjs')

const igual = (a, b) => Object.is(a, b)
const checks = [
  ['media: soma e divide, e a lista vazia dá 0', () => igual(est.media([1, 2, 3]), 2) && igual(est.media([]), 0)],
  ['mediana: acha o meio, e a de tamanho par é a média dos dois do meio', () => igual(est.mediana([3, 1, 2]), 2) && igual(est.mediana([1, 2, 3, 4]), 2.5) && igual(est.mediana([]), 0)],
  ['mediana: não altera a lista recebida', () => { const l = [3, 1, 2]; est.mediana(l); return l.join() === '3,1,2' }],
  ['moda: o valor mais frequente, o menor no empate, e null se a lista é vazia', () => igual(est.moda([1, 2, 2, 3]), 2) && igual(est.moda([3, 1, 3, 1]), 1) && igual(est.moda([]), null)],
  ['ligação: src/index.mjs reexporta media, mediana e moda', () => idx.media === est.media && idx.mediana === est.mediana && idx.moda === est.moda],
]
let falhou = false
checks.forEach(([nome, fn], i) => {
  let ok = false
  try { ok = !!est && fn() } catch { ok = false }
  if (!ok) falhou = true
  console.log(`${ok ? 'ok' : 'not ok'} ${i + 1} - ${nome}`)
})
process.exit(falhou ? 1 : 0)
