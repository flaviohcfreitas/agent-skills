// Simulador de teste dos workflows: roda o .js REAL com os hooks falsos do runtime
// (args, agent, parallel, pipeline, phase, log, workflow, budget). Sem dependência.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const AQUI = dirname(fileURLToPath(import.meta.url))
export const PAPEIS = ['scout', 'reach', 'implement', 'monitoring']

export const ler = (nome) => readFileSync(join(AQUI, `${nome}.js`), 'utf8')

// O `meta` é literal puro: extrai da chave de abertura até a de fechamento.
export function textoDoMeta(corpo) {
  const ini = corpo.indexOf('export const meta =')
  if (ini < 0) throw new Error('sem export const meta')
  const abre = corpo.indexOf('{', ini)
  let n = 0
  for (let i = abre; i < corpo.length; i++) {
    if (corpo[i] === '{') n++
    else if (corpo[i] === '}' && --n === 0) return corpo.slice(abre, i + 1)
  }
  throw new Error('meta sem fechamento')
}
export const avaliarMeta = (corpo) => new Function('return ' + textoDoMeta(corpo))()

export async function simular(nome, { args, agente, filhos = {}, _compartilhado, _nivel = 0 } = {}) {
  const corpo = ler(nome).replace('export const meta', 'const meta')
  const est = _compartilhado ?? { chamadas: [], logs: [], fases: [], workflows: [], emVoo: 0, maxEmVoo: 0 }

  const agent = async (prompt, opts = {}) => {
    if ('model' in opts || 'effort' in opts) throw new Error('o workflow não escolhe model nem effort')
    if (!PAPEIS.includes(opts.agentType)) throw new Error(`agentType inválido: ${opts.agentType}`)
    est.chamadas.push({ prompt, opts, nome })
    est.emVoo++
    est.maxEmVoo = Math.max(est.maxEmVoo, est.emVoo)
    await new Promise((r) => setImmediate(r)) // deixa os irmãos de parallel() dispararem
    try {
      return typeof agente === 'function' ? await agente(prompt, opts) : (agente?.[opts.label] ?? null)
    } finally { est.emVoo-- }
  }
  const parallel = (thunks) => Promise.all(thunks.map(async (t) => { try { return await t() } catch { return null } }))
  const pipeline = (items, ...stages) => Promise.all(items.map(async (item, i) => {
    try { let r = item; for (const s of stages) r = await s(r, item, i); return r } catch { return null }
  }))
  const workflow = async (nomeFilho, a) => {
    est.workflows.push({ nome: nomeFilho, args: a })
    if (_nivel >= 1) throw new Error('workflow() dentro de filho: um nível só')
    if (filhos[nomeFilho]) return filhos[nomeFilho](a)
    return (await simular(nomeFilho, { args: a, agente, filhos, _compartilhado: est, _nivel: 1 })).retorno
  }
  const phase = (t) => est.fases.push(t)
  const log = (m) => est.logs.push(m)
  const budget = { total: null, spent: () => 0, remaining: () => Infinity }

  const fn = new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'workflow', 'budget', corpo)
  const retorno = await fn(args, agent, parallel, pipeline, phase, log, workflow, budget)
  return { retorno, ...est }
}
