export const meta = {
  name: 'orbti-loop',
  description: 'Roda o ciclo scout → reach → implement → monitoring sobre uma tarefa, com as voltas e o teto em código; para nas perguntas do reach e em fluxo crítico',
  whenToUse: 'Chamado pela skill orbti-loop, com args { tarefa, respostas?, autorizar_critico? }',
  phases: [
    { title: 'Scout', detail: 'três ângulos em paralelo: código, decisões, comportamento' },
    { title: 'Reach', detail: 'decide: spec, perguntas ao usuário, ou mais fatos' },
    { title: 'Implement', detail: 'constrói a spec fechada, com teste' },
    { title: 'Monitoring', detail: 'confere: passou, refaz ou humano' },
  ],
}

// --- os contratos de cada papel --------------------------------------------------------

const ACHADOS = {
  type: 'object',
  properties: {
    achados: { type: 'array', items: { type: 'object', properties: { fato: { type: 'string' }, endereco: { type: 'string' } }, required: ['fato', 'endereco'] } },
    lacunas: { type: 'array', items: { type: 'string' } },
  },
  required: ['achados', 'lacunas'],
}

const REACH = {
  type: 'object',
  properties: {
    estado: { type: 'string', enum: ['spec', 'perguntas', 'mais_fatos'] },
    perguntas: { type: 'array', items: { type: 'object', properties: { pergunta: { type: 'string' }, recomendacao: { type: 'string' }, opcoes: { type: 'array', items: { type: 'string' } } }, required: ['pergunta', 'recomendacao'] } },
    mais_fatos: { type: 'array', items: { type: 'string' } },
    critico: { type: 'boolean' },
    suposicoes: { type: 'array', items: { type: 'string' } },
    spec: {
      type: 'object',
      properties: {
        objetivo: { type: 'string' },
        mudancas: { type: 'array', items: { type: 'object', properties: { onde: { type: 'string' }, o_que: { type: 'string' } }, required: ['onde', 'o_que'] } },
        criterio_pronto: { type: 'array', items: { type: 'string' } },
        fora_do_escopo: { type: 'array', items: { type: 'string' } },
      },
      required: ['objetivo', 'mudancas', 'criterio_pronto'],
    },
  },
  required: ['estado'],
}

const IMPLEMENT = {
  type: 'object',
  properties: {
    arquivos: { type: 'array', items: { type: 'string' } },
    verificacao: { type: 'object', properties: { comando: { type: 'string' }, passou: { type: 'boolean' }, saida: { type: 'string' } }, required: ['comando', 'passou'] },
    lacuna: { type: 'string' },
    decisoes: { type: 'array', items: { type: 'string' } },
  },
  required: ['arquivos', 'verificacao'],
}

const MONITORING = {
  type: 'object',
  properties: {
    veredito: { type: 'string', enum: ['passou', 'refaz', 'humano'] },
    faltou: { type: 'array', items: { type: 'string' } },
    motivo: { type: 'string' },
    criterios: { type: 'array', items: { type: 'object', properties: { criterio: { type: 'string' }, atende: { type: 'boolean' }, evidencia: { type: 'string' } }, required: ['criterio', 'atende'] } },
  },
  required: ['veredito', 'motivo'],
}

// --- a entrada ------------------------------------------------------------------------

const tarefa = args?.tarefa
if (!tarefa) throw new Error('orbti-loop precisa de args.tarefa')
const respostas = args?.respostas ?? []
const MAX_VOLTAS = 2
// Regra que protege dinheiro fica em código: o tema da tarefa marca o crítico, diga o reach o que disser.
const TEMA_CRITICO = /cr[eé]dito|parcela|pagamento|d[eé]bito|cobran[çc]a|juros|cadastro|autentica|login|senha|\bcpf\b|\bcnpj\b|open finance|proposta/i
const temaCritico = TEMA_CRITICO.test(tarefa)
const decididoSozinho = []

const texto = (o) => JSON.stringify(o, null, 2)
const fim = (estado, extra) => ({ estado, tarefa, decidido_sozinho: decididoSozinho, ...extra })

// --- scout: três ângulos em paralelo; o reach precisa de todos juntos --------------------

phase('Scout')
const ANGULOS = [
  { id: 'codigo', foco: 'onde isso mora no código hoje: arquivos, funções, quem chama, e os testes que cobrem' },
  { id: 'decisoes', foco: 'o que já foi decidido sobre isso: docs, ADR, CONTEXT.md, agent.md, commits recentes, cards' },
  { id: 'comportamento', foco: 'como se comporta hoje: o comando que roda, o teste, o log, a saída observável' },
]
const scout = (foco, label) => agent(
  `Tarefa que o reach vai decidir:\n${tarefa}\n\nBusque e junte, só lendo: ${foco}.\nCada achado com endereço (arquivo:linha, comando, link). O que não achar vai em lacunas.`,
  { agentType: 'scout', phase: 'Scout', label, schema: ACHADOS },
)
const achados = (await parallel(ANGULOS.map((a) => () => scout(a.foco, `scout:${a.id}`)))).filter(Boolean)
if (!achados.length) return fim('humano', { motivo: 'nenhum scout voltou' })
log(`scouts: ${achados.reduce((n, a) => n + a.achados.length, 0)} achados`)

// --- o ciclo ------------------------------------------------------------------------

let lacunaDoImplement = null
for (let voltaAoReach = 0; voltaAoReach <= 1; voltaAoReach++) {
  // reach: decide, ou pede fatos, ou devolve perguntas
  let decisao = null
  for (let pedidos = 0; pedidos <= 2 && !decisao; pedidos++) {
    phase('Reach')
    const r = await agent(
      `Tarefa:\n${tarefa}\n\nO que os scouts juntaram:\n${texto(achados)}\n\n` +
      `Respostas do usuário até aqui:\n${respostas.length ? texto(respostas) : '(nenhuma)'}\n\n` +
      (lacunaDoImplement ? `O implement parou por uma lacuna na spec anterior: ${lacunaDoImplement}\n\n` : '') +
      'Decida, com as skills do reach (grilling, to-spec, prototype, diagnosing-bugs…). Devolva UM estado:\n' +
      '- "spec": a spec fechada — o que muda, onde, critério de pronto verificável, fora do escopo;\n' +
      '- "perguntas": o que só o usuário responde, cada pergunta com a sua recomendação;\n' +
      '- "mais_fatos": o que um scout precisa buscar antes de você decidir.\n' +
      'Regra de NEGÓCIO sem resposta nos achados (dinheiro, arredondamento, prazo, regra para o cliente) é PERGUNTA, não suposição. ' +
      'Suposição só para detalhe técnico que se troca sem custo. ' +
      'Marque critico=true pelo TEMA da tarefa (dinheiro, crédito, cadastro, auth, dado sensível), não pelo repositório. ' +
      'Liste em suposicoes o que você assumiu sem perguntar.',
      { agentType: 'reach', phase: 'Reach', label: `reach:${voltaAoReach}.${pedidos}`, schema: REACH },
    )
    if (!r) return fim('humano', { motivo: 'o reach não respondeu' })
    decididoSozinho.push(...(r.suposicoes ?? []))
    if (r.estado === 'perguntas' && r.perguntas?.length) return fim('perguntas', { perguntas: r.perguntas })
    if (r.estado === 'mais_fatos' && r.mais_fatos?.length) {
      const extra = (await parallel(r.mais_fatos.map((f, i) => () => scout(f, `scout:pedido${pedidos}.${i}`)))).filter(Boolean)
      achados.push(...extra)
      continue
    }
    if (r.estado !== 'spec' || !r.spec) return fim('humano', { motivo: 'o reach não fechou uma spec', resposta: r })
    decisao = r
  }
  if (!decisao) return fim('humano', { motivo: 'o reach pediu fatos três vezes sem fechar a spec' })
  if ((decisao.critico || temaCritico) && !args?.autorizar_critico) {
    return fim('critico', { spec: decisao.spec, motivo: `fluxo crítico${temaCritico ? ' (pelo tema da tarefa)' : ''}: a construção espera a autorização do usuário` })
  }

  // implement ↔ monitoring, até MAX_VOLTAS
  let faltou = null
  for (let volta = 0; ; volta++) {
    phase('Implement')
    const imp = await agent(
      `Spec fechada:\n${texto(decisao.spec)}\n\n` +
      (faltou ? `O monitoring reprovou a entrega anterior. Falta:\n${texto(faltou)}\n\n` : '') +
      'Construa com as skills do implement (implement, tdd). Teste primeiro quando a fatia muda comportamento. ' +
      'Toque só o que a spec pede. Rode a verificação do projeto e devolva o comando e se passou. ' +
      'Spec com lacuna: devolva a lacuna, sem decidir.',
      { agentType: 'implement', phase: 'Implement', label: `implement:${volta}`, schema: IMPLEMENT },
    )
    if (!imp) return fim('humano', { motivo: 'o implement não respondeu', spec: decisao.spec })
    decididoSozinho.push(...(imp.decisoes ?? []))
    if (imp.lacuna) {
      if (voltaAoReach >= 1) return fim('humano', { motivo: `segunda lacuna de spec: ${imp.lacuna}`, spec: decisao.spec })
      lacunaDoImplement = imp.lacuna
      log(`lacuna de spec — volta ao reach: ${imp.lacuna}`)
      break
    }

    phase('Monitoring')
    const mon = await agent(
      `Spec:\n${texto(decisao.spec)}\n\nO implement diz que mudou:\n${texto(imp.arquivos)}\ne rodou:\n${texto(imp.verificacao)}\n\n` +
      'Confira pelo DIFF (git diff), não pelo relato. Rode a verificação você mesmo. Se o projeto tiver o juiz do ' +
      'decision-gate (npm run juiz -- --gate), rode-o e pese o veredito. Julgue cada critério de pronto com evidência. ' +
      'Veredito: passou · refaz (com o que falta, objetivo) · humano (spec ambígua, decisão de produto, fluxo crítico).',
      { agentType: 'monitoring', phase: 'Monitoring', label: `monitoring:${volta}`, schema: MONITORING },
    )
    if (!mon) return fim('humano', { motivo: 'o monitoring não respondeu', spec: decisao.spec })
    if (mon.veredito === 'passou') {
      return fim('passou', { spec: decisao.spec, arquivos: imp.arquivos, verificacao: imp.verificacao, criterios: mon.criterios ?? [], voltas: volta })
    }
    if (mon.veredito === 'humano') return fim('humano', { motivo: mon.motivo, spec: decisao.spec, arquivos: imp.arquivos })
    if (volta >= MAX_VOLTAS) return fim('humano', { motivo: `refaz depois de ${MAX_VOLTAS} voltas: ${mon.motivo}`, faltou: mon.faltou, spec: decisao.spec })
    faltou = mon.faltou ?? [mon.motivo]
    log(`refaz (${volta + 1}/${MAX_VOLTAS}): ${mon.motivo}`)
  }
}
return fim('humano', { motivo: 'o ciclo terminou sem veredito' })
