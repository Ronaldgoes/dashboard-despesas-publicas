import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { resolve } from 'node:path'

const source = resolve(process.argv[2] ?? '')
const sourceManifest = resolve(process.argv[3] ?? '.dados-dashboard-options/dashboard/manifest.json')
const outputDirectory = resolve(process.argv[4] ?? '.dados-dashboard-global')
if (!process.argv[2]) throw new Error('Uso: node scripts/gerar-base-global-por-ano.mjs "C:/caminho/base.csv"')

const fields = ['cdorgao', 'nmorgao', 'cdunidadegestora', 'nmunidadegestora', 'nuano', 'cdcategoria', 'nmcategoria', 'cdgruponaturezadespesa', 'nmgruponaturezadespesa', 'cdelemento', 'nmelemento', 'cdsubelemento', 'nmsubelemento', 'cdsubacao', 'nmsubacao', 'cdcredor', 'nmcredor', 'cdfuncao', 'nmfuncao', 'cdsubfuncao', 'nmsubfuncao', 'cdprograma', 'nmprograma', 'cdacao', 'nmacao', 'cdfonterecurso', 'nmfonterecurso', 'vlempenhado', 'vlliquidado', 'vlpago']

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

await mkdir(resolve(outputDirectory, 'dashboard/global-years'), { recursive: true })
const writers = new Map()
async function append(year, values) {
  let writer = writers.get(year)
  if (!writer) {
    const path = resolve(outputDirectory, `dashboard/global-years/${year}.json`)
    writer = { path, stream: createWriteStream(path), count: 0, first: true }
    writers.set(year, writer)
    if (!writer.stream.write('[')) await once(writer.stream, 'drain')
  }
  const encoded = `${writer.first ? '' : ','}${JSON.stringify(values)}`
  writer.first = false; writer.count += 1
  if (!writer.stream.write(encoded)) await once(writer.stream, 'drain')
}

for await (const row of readRows()) {
  const year = String(row.nuano ?? '').trim()
  if (year) await append(year, fields.map((field) => String(row[field] ?? '')))
}
for (const writer of writers.values()) {
  writer.stream.end(']')
  await once(writer.stream, 'finish')
}

const manifest = JSON.parse(await readFile(sourceManifest, 'utf8'))
manifest.version = 5
manifest.globalYears = [...writers.entries()].map(([year, writer]) => ({
  year: Number(year), path: `dashboard/global-years/${year}.json`, count: writer.count,
})).sort((a, b) => a.year - b.year)
await mkdir(resolve(outputDirectory, 'dashboard'), { recursive: true })
await writeFile(resolve(outputDirectory, 'dashboard/manifest.json'), JSON.stringify(manifest))
console.log(`Base geral preparada: ${manifest.globalYears.map((entry) => `${entry.year}: ${entry.count}`).join(', ')}`)
