import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve(process.argv[2] ?? '')
const manifestPath = resolve(process.argv[3] ?? '.dados-dashboard/dashboard/manifest.json')
const output = resolve(process.argv[4] ?? '.dados-dashboard-options/dashboard/manifest.json')
if (!process.argv[2]) throw new Error('Uso: node scripts/gerar-opcoes-globais-dashboard.mjs "C:/caminho/base.csv"')

const dimensions = {
  unidadeGestora: ['cdunidadegestora', 'nmunidadegestora'], categoria: ['cdcategoria', 'nmcategoria'],
  grupo: ['cdgruponaturezadespesa', 'nmgruponaturezadespesa'], elemento: ['cdelemento', 'nmelemento'],
  subelemento: ['cdsubelemento', 'nmsubelemento'], funcao: ['cdfuncao', 'nmfuncao'],
  subfuncao: ['cdsubfuncao', 'nmsubfuncao'], programa: ['cdprograma', 'nmprograma'], acao: ['cdacao', 'nmacao'],
  subacao: ['cdsubacao', 'nmsubacao'], credor: ['cdcredor', 'nmcredor'], fonteRecurso: ['cdfonterecurso', 'nmfonterecurso'],
}

async function* readRows() {
  let headers; let row = []; let cell = ''; let quoted = false
  for await (const chunk of createReadStream(source, { encoding: 'latin1' })) {
    for (let i = 0; i < chunk.length; i += 1) {
      const char = chunk[i]; const next = chunk[i + 1]
      if (char === '"' && quoted && next === '"') { cell += '"'; i += 1 }
      else if (char === '"') quoted = !quoted
      else if (char === ';' && !quoted) { row.push(cell); cell = '' }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') i += 1
        row.push(cell); cell = ''
        if (!headers) headers = row
        else if (row.some(Boolean)) yield Object.fromEntries(headers.map((key, index) => [key, row[index] ?? '']))
        row = []
      } else cell += char
    }
  }
}

const byYear = new Map()
for await (const row of readRows()) {
  const year = String(row.nuano ?? '').trim()
  if (!year) continue
  const options = byYear.get(year) ?? Object.fromEntries(Object.keys(dimensions).map((key) => [key, new Set()]))
  for (const [key, [codeField, nameField]] of Object.entries(dimensions)) {
    const code = String(row[codeField] ?? '').trim(); const name = String(row[nameField] ?? '').trim()
    if (code || name) options[key].add([code, name].filter(Boolean).join(' — '))
  }
  byYear.set(year, options)
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
manifest.version = 4
manifest.globalOptions = [...byYear.entries()].map(([year, options]) => ({
  year: Number(year),
  options: Object.fromEntries(Object.entries(options).map(([key, values]) => [key, [...values].sort((a, b) => a.localeCompare(b, 'pt-BR'))])),
})).sort((a, b) => a.year - b.year)
await mkdir(resolve(output, '..'), { recursive: true })
await writeFile(output, JSON.stringify(manifest))
console.log(`Opções globais geradas para ${manifest.globalOptions.length} anos.`)
