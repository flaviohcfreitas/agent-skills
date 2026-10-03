export const meta = {
  name: 'adversarial',
  description: 'N monitorings, cada um com uma lente, tentam REFUTAR a mesma afirmação, cegos uns aos outros; a maioria decide, e a conta é código.',
  whenToUse: 'Uma afirmação a derrubar (o achado é real? o diff está certo?). args: { afirmacao, contexto?, arquivos?, base?, lentes? }. Não é o gauntlet de tela do npm run adversarial. Chame da sessão, nunca de dentro do laço ou das ondas.',
  phases: [{ title: 'Refutar', detail: 'um monitoring por lente, em paralelo' }],
}

const LENTES = {
  correcao: 'um caso (entrada, borda, estado) em que a afirmação é falsa, lendo o código',
  seguranca: 'um jeito de a mudança vazar dado, furar auth, aceitar entrada hostil ou gravar PII',
  reproduz: 'que a afirmação não se sustenta rodando: um teste, um comando, um script local que mostra o contrário. Nunca contra produção',
  spec: 'que a mudança não faz o que a spec pede, ou faz além',
  desempenho: 'um caminho em que a mudança degrada tempo ou memória de forma mensurável',
}
const VOTO = {
  type: 'object',
  properties: { refutada: { type: 'boolean' }, evidencia: { type: 'string' }, endereco: { type: 'string' } },
  required: ['refutada', 'evidencia', 'endereco'],
}

const a = args ?? {}
const lentes = a.lentes ?? ['correcao', 'seguranca', 'reproduz']
const motivos = []
if (typeof a.afirmacao !== 'string' || !a.afirmacao.trim()) motivos.push('afirmacao ausente')
if (!Array.isArray(lentes) || lentes.length < 3) motivos.push('são precisas ao menos 3 lentes')
else {
  for (const l of lentes) if (!(l in LENTES)) motivos.push(`lente desconhecida: ${l}`)
  if (new Set(lentes).size !== lentes.length) motivos.push('lente repetida')
}
if (motivos.length) {
  return { padrao: 'adversarial', afirmacao: a.afirmacao ?? null, veredito: 'invalido', motivos, proximo_passo: 'corrija os args (motivos)' }
}

phase('Refutar')
const brutos = await parallel(lentes.map((l) => () => agent(
  `Tente REFUTAR esta afirmação, pela lente "${l}": mostre ${LENTES[l]}.\n\nAfirmação: ${a.afirmacao}\n` +
  (a.contexto ? `\nContexto:\n${a.contexto}\n` : '') +
  (a.arquivos?.length ? `\nOnde olhar: ${a.arquivos.join(', ')} (o diff é deles contra ${a.base ?? 'HEAD'}).\n` : '') +
  '\nSó leia e rode local; não edite arquivo nem toque em produção. Na dúvida, refutada: true — quem sustenta a afirmação precisa da evidência que a sustenta. ' +
  'Devolva refutada, a evidencia concreta e o endereco (arquivo:linha ou comando).',
  { label: `lente:${l}`, phase: 'Refutar', agentType: 'monitoring', schema: VOTO })))

const votos = lentes.map((l, i) => brutos[i] && typeof brutos[i].refutada === 'boolean' ? { lente: l, ...brutos[i] } : null)
const validos = votos.filter(Boolean)
const n = lentes.length
const refutam = validos.filter((v) => v.refutada).length
const sustentam = validos.length - refutam
const veredito = refutam > n / 2 ? 'refutada' : sustentam > n / 2 ? 'sustentada' : 'humano'
lentes.forEach((l, i) => { if (!votos[i]) log(`voto perdido na lente ${l}: não conta como maioria`) })
log(`placar: ${refutam} refutam · ${sustentam} sustentam · ${n - validos.length} sem voto`)

return {
  padrao: 'adversarial',
  afirmacao: a.afirmacao,
  veredito,
  placar: { refutam, sustentam, sem_voto: n - validos.length, n },
  votos: validos,
  proximo_passo: veredito === 'humano'
    ? 'sem maioria: leve o placar e as evidências ao usuário'
    : veredito === 'refutada'
      ? 'a afirmação caiu: se era um achado, ele cai; se era "o diff está certo", leve as evidências ao implement (refaz) ou ao reach (desalinhado)'
      : 'a afirmação se sustenta contra as lentes pedidas',
}
