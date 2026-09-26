#!/usr/bin/env node
// Esvazia a fila da memória pessoal (~/.menosjuros/memoria-pessoal/*.json) no vault Second Brain,
// pelo protocolo do vault (AGENTS.md, "Memória compartilhada"): tudo entra no Daily/logs do dia, na
// seção da categoria, e cada gravação ganha uma linha no Memoria/log.md. Correção e preferência viram
// PROPOSTA — nunca edição de Memoria/Contratos/, que é do Elrond.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FILA = join(homedir(), '.menosjuros', 'memoria-pessoal')
export const AGENTE = 'Claude (Claude Code, memoria)'

const SECAO = {
  correcao: 'Propostas', preferencia: 'Propostas',
  decisao: 'Decisões',
  pessoa: 'Aprendizados', meta: 'Aprendizados', aprendizado: 'Aprendizados',
}

/** O vault: a variável, a VM, o Mac — nessa ordem. Nenhum existe: null, e nada é gravado. */
export function caminhoDoVault(env = process.env, existe = existsSync) {
  for (const c of [env.SECOND_BRAIN_PATH, '/home/box/Second Brain', join(homedir(), 'Second Brain')]) {
    if (c && existe(join(c, 'AGENTS.md'))) return c
  }
  return null
}

const cabecalho = (dia) => `---\ntitle: "Daily log ${dia}"\ntipo: daily-log\nautor: ia\nagente: "${AGENTE}"\natualizado: ${dia}\n---\n\n# Daily log — ${dia}\n`

/** Põe a linha na seção do log do dia; cria o arquivo e a seção quando faltam. */
export function anexarNaSecao(texto, secao, linha) {
  const titulo = `## ${secao}`
  const i = texto.indexOf(`\n${titulo}\n`)
  if (i < 0) return `${texto.trimEnd()}\n\n${titulo}\n\n${linha}\n`
  const inicio = i + titulo.length + 2
  const proxima = texto.indexOf('\n## ', inicio)
  const fim = proxima < 0 ? texto.length : proxima
  return `${texto.slice(0, fim).trimEnd()}\n${linha}\n${texto.slice(fim)}`
}

const linhaDaObs = (o) => {
  const rotulo = o.categoria === 'correcao' || o.categoria === 'preferencia' ? `**Proposta (${o.categoria}):** ` : ''
  const fatos = (o.fatos ?? []).length ? ` — ${o.fatos.join('; ')}` : ''
  return `- ${rotulo}${o.titulo}${fatos}. ${o.narrativa}`.replace(/\s+/g, ' ').trim()
}

/** Grava uma observação no vault. Devolve o caminho relativo do log do dia. */
export function gravarNoVault(o, vault, agora = new Date()) {
  const dia = o.data ?? agora.toISOString().slice(0, 10)
  const secao = SECAO[o.categoria] ?? 'Aprendizados'
  const rel = join('Daily', 'logs', `${dia}.md`)
  const arq = join(vault, rel)
  mkdirSync(join(vault, 'Daily', 'logs'), { recursive: true })
  const atual = existsSync(arq) ? readFileSync(arq, 'utf8') : cabecalho(dia)
  writeFileSync(arq, anexarNaSecao(atual, secao, linhaDaObs(o)))
  const hora = agora.toTimeString().slice(0, 5)
  const acao = secao === 'Propostas' ? 'proposta' : 'atualizou'
  appendFileSync(join(vault, 'Memoria', 'log.md'), `- ${hora} · ${AGENTE} · ${acao} · \`${rel}\` · ${o.titulo}\n`)
  return rel
}

/** Drena a fila: cada item gravado sai para `feitos/`; sem vault, nada sai da fila. */
export function drenar({ fila = FILA, vault = caminhoDoVault(), agora = new Date() } = {}) {
  if (!vault) return { erro: 'vault não encontrado — defina SECOND_BRAIN_PATH', gravados: 0 }
  if (!existsSync(fila)) return { gravados: 0 }
  const feitos = join(fila, 'feitos')
  mkdirSync(feitos, { recursive: true })
  let gravados = 0
  for (const f of readdirSync(fila).filter((x) => x.endsWith('.json')).sort()) {
    const o = JSON.parse(readFileSync(join(fila, f), 'utf8'))
    gravarNoVault(o, vault, agora)
    renameSync(join(fila, f), join(feitos, f))
    gravados++
  }
  return { gravados, vault }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = drenar()
  console.log(r.erro ? `second-brain: ${r.erro}` : `second-brain: ${r.gravados} observação(ões) no vault`)
  process.exit(r.erro ? 1 : 0)
}
