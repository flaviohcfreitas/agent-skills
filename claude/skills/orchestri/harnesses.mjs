#!/usr/bin/env node
// Descobre os harnesses desta máquina e monta o plano: qual harness e qual modelo roda cada papel.
// Uso: node harnesses.mjs [--claude] [--codex] [--cursor] [--grok]   (sem flag: todos os disponíveis)
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// <plano> — bloco puro, copiado para orchestri.js por sincronizar.mjs (o teste confere). Sem import aqui dentro.
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
    { harness: 'claude', modelo: 'claude-opus-5-5', esforco: 'high', provedor: 'anthropic' },
    { harness: 'cursor', modelo: 'grok-4.7-high', esforco: null, provedor: 'xai' },
  ],
}

// O comando sem tela de cada harness externo. O briefing entra por arquivo ({briefing}).
// Claude não tem comando: roda como subagente nativo do workflow.
// Scout e reach só leem. O implement escreve. O monitoring roda a verificação e o juiz — precisa de
// shell, tmp e rede —, e "não conserta" é regra do prompt dele, não do sandbox.
export function comando(c, papel) {
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
    default:
      return null
  }
}


export function planejar(disponiveis, pedidos = []) {
  const desconhecidos = pedidos.filter((h) => !HARNESSES[h])
  if (desconhecidos.length) throw new Error(`harness desconhecido: ${desconhecidos.join(', ')}`)
  const ausentes = pedidos.filter((h) => !disponiveis.includes(h))
  if (ausentes.length) throw new Error(`harness pedido e não instalado: ${ausentes.join(', ')}`)
  const permitidos = pedidos.length ? pedidos : disponiveis
  const avisos = []
  const cabe = (c) => permitidos.includes(c.harness) && (!c.requer || permitidos.includes(c.requer))
  const escolher = (papel, filtro = () => true) => PREFERENCIA[papel].find((c) => cabe(c) && filtro(c))
  const semPar = ({ monitoring, requer, ...c }) => c

  // Implement só entra se houver quem o confira: o par dele, outro provedor, ou ao menos outro modelo.
  const monitoringPara = (imp) => {
    const par = imp.monitoring && permitidos.includes(imp.monitoring.harness) ? imp.monitoring : null
    return par ?? escolher('monitoring', (c) => c.provedor !== imp.provedor) ?? escolher('monitoring', (c) => c.modelo !== imp.modelo)
  }
  const papeis = {}
  for (const papel of ['scout', 'reach', 'implement']) {
    const c = papel === 'implement' ? escolher(papel, (x) => !!monitoringPara(x)) : escolher(papel)
    if (!c) throw new Error(`nenhum harness permitido roda o papel ${papel} (permitidos: ${permitidos.join(', ')})`)
    papeis[papel] = { ...semPar(c), comando: comando(c, papel) }
  }
  // Monitoring: outro provedor que o implement; sem isso, ao menos outro modelo.
  const imp = papeis.implement
  const mon = monitoringPara(escolher('implement', (c) => c.modelo === imp.modelo && c.harness === imp.harness))
  if (!mon) throw new Error('nenhum monitoring com modelo diferente do implement')
  if (mon.provedor === imp.provedor) avisos.push(`monitoring (${mon.modelo}) é do mesmo provedor que o implement (${imp.modelo}): só há um provedor permitido`)
  papeis.monitoring = { ...mon, comando: comando(mon, 'monitoring') }

  for (const [papel, c] of Object.entries(papeis)) {
    if (c.harness !== PREFERENCIA[papel][0].harness) avisos.push(`${papel} caiu para ${c.harness} (${c.modelo}): o padrão ${PREFERENCIA[papel][0].harness} não está permitido ou instalado`)
  }
  // Reserva: o Grok pode falhar na hora (erro, cota). O workflow troca o ticket para este par.
  let reserva = null
  if (imp.modelo.startsWith('grok-4.7')) {
    const r = PREFERENCIA.implement.find((c) => c.monitoring && cabe(c))
    if (r && permitidos.includes(r.monitoring.harness)) {
      reserva = { implement: { ...semPar(r), comando: comando(r, 'implement') }, monitoring: { ...r.monitoring, comando: comando(r.monitoring, 'monitoring') } }
    }
  }
  return { modo: pedidos.length ? pedidos.join('+') : 'todos', disponiveis, permitidos, papeis, reserva, avisos }
}

// </plano>

export function detectar(existe = (bin) => { try { execFileSync('/bin/sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' }); return true } catch { return false } }) {
  return Object.keys(HARNESSES).filter((h) => existe(HARNESSES[h].bin))
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--disponiveis')) { process.stdout.write(JSON.stringify(detectar()) + '\n'); process.exit(0) }
    const pedidos = process.argv.slice(2).map((a) => {
      if (!a.startsWith('--')) throw new Error(`argumento inválido: ${a}`)
      return a.slice(2)
    })
    process.stdout.write(JSON.stringify(planejar(detectar(), pedidos), null, 2) + '\n')
  } catch (e) {
    process.stderr.write(`harnesses: erro — ${e.message}\n`)
    process.exit(1)
  }
}
