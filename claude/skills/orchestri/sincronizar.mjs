#!/usr/bin/env node
// Copia o bloco <plano> de harnesses.mjs para orchestri.js, sem "export": o workflow não importa
// módulos, e o plano tem de ser código, não um JSON redigitado por modelo.
import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
const bloco = (t) => {
  const a = t.indexOf('// <plano>'), b = t.indexOf('// </plano>')
  if (a < 0 || b < 0) throw new Error('marcadores <plano> ausentes')
  return t.slice(a, b + '// </plano>'.length)
}
export function esperado() {
  return bloco(readFileSync(join(DIR, 'harnesses.mjs'), 'utf8')).replace(/^export /gm, '')
}
export function atual() {
  return bloco(readFileSync(join(DIR, 'orchestri.js'), 'utf8'))
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = readFileSync(join(DIR, 'orchestri.js'), 'utf8')
  writeFileSync(join(DIR, 'orchestri.js'), o.replace(atual(), esperado()))
  process.stdout.write('orchestri.js sincronizado com harnesses.mjs\n')
}
