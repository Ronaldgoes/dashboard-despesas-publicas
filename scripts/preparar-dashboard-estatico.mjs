import { createReadStream } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const source = resolve(process.argv[2] ?? '')
const output = resolve(process.argv[3] ?? '.dados-dashboard')
if (!process.argv[2]) throw new Error('Uso: npm run preparar:dashboard -- "C:/caminho/base.csv"')

const fields = ['cdorgao', 'nmorgao', 'cdunidadegestora', 'nmunidadegestora', 'nuano', 'cdcategoria', 'nmcategoria', 'cdgruponaturezadespesa', 'nmgruponaturezadespesa', 'cdelemento', 'nmelemento', 'cdsubelemento', 'nmsubelemento', 'cdsubacao', 'nmsubacao', 'cdcredor', 'nmcredor', 'cdfuncao', 'nmfuncao', 'cdsubfuncao', 'nmsubfuncao', 'cdprograma', 'nmprograma', 'cdacao', 'nmacao', 'cdfonterecurso', 'nmfonterecurso', 'vlempenhado', 'vlliquidado', 'vlpago']
const folder = (value) => encodeURIComponent(String(value ?? '').trim())
const rowsPerFile = 2500

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

await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true })
const releaseId = `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`
const groups = new Map(); const organizations = new Map(); let records = 0
async function flush(group) {
  if (!group.rows.length) return
  const path = `dashboard/releases/${releaseId}/${folder(group.org)}/${group.year}/${String(group.chunk).padStart(4, '0')}.json`
  await mkdir(resolve(output, path, '..'), { recursive: true }); await writeFile(resolve(output, path), JSON.stringify(group.rows)); group.files.push({ path, count: group.rows.length }); group.rows = []; group.chunk += 1
}
for await (const row of readRows()) {
  const org = String(row.cdorgao ?? '').trim(); const name = String(row.nmorgao ?? '').trim(); const year = String(row.nuano ?? '').trim()
  if (!org || !name || !year) continue
  const key = `${org}||${year}`; const group = groups.get(key) ?? { org, year, rows: [], files: [], chunk: 1 }; group.rows.push(fields.map((field) => String(row[field] ?? ''))); groups.set(key, group); if (group.rows.length >= rowsPerFile) await flush(group)
  const item = organizations.get(org) ?? { id: folder(org), code: org, name, total: 0, years: new Map() }; item.total += 1; item.years.set(year, (item.years.get(year) ?? 0) + 1); organizations.set(org, item); records += 1
}
for (const group of groups.values()) await flush(group)
const manifest = { version: 1, releaseId, sourceFile: basename(source), records, fields, organizations: [...organizations.values()].map((org) => ({ ...org, years: [...org.years.entries()].map(([year, count]) => ({ year: Number(year), count, chunks: groups.get(`${org.code}||${year}`).files })).sort((a, b) => a.year - b.year) })).sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, 'pt-BR')) }
await mkdir(resolve(output, 'dashboard'), { recursive: true }); await writeFile(resolve(output, 'dashboard/manifest.json'), JSON.stringify(manifest))
console.log(`Dashboard preparado: ${records.toLocaleString('pt-BR')} linhas em ${groups.size} recortes.`)
