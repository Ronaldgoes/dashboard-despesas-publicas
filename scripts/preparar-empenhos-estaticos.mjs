import { createReadStream } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { empenhoFieldKeys, empenhoFields } from '../shared/empenhoFields.js'

const source = resolve(process.argv[2] ?? '')
const outputDirectory = resolve(process.argv[3] ?? '.dados-empenho')
const recordsPerFile = 250

if (!process.argv[2]) {
  throw new Error('Uso: npm run preparar:empenhos -- "C:/caminho/base.csv"')
}

async function* csvRows() {
  let headers
  let row = []
  let cell = ''
  let quoted = false

  for await (const chunk of createReadStream(source, { encoding: 'latin1' })) {
    for (let index = 0; index < chunk.length; index += 1) {
      const char = chunk[index]
      const next = chunk[index + 1]

      if (char === '"' && quoted && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = !quoted
      } else if (char === ';' && !quoted) {
        row.push(cell)
        cell = ''
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') index += 1
        row.push(cell)
        cell = ''
        if (!headers) headers = row
        else if (row.some(Boolean)) yield Object.fromEntries(headers.map((key, column) => [key, row[column] ?? '']))
        row = []
      } else {
        cell += char
      }
    }
  }
}

function getYear(value) {
  return String(value ?? '').match(/20\d{2}/)?.[0] ?? ''
}

function folderName(value) {
  return encodeURIComponent(String(value).trim())
}

async function writeChunk(releaseDirectory, state) {
  if (!state.records.length) return
  const relativePath = `releases/${state.releaseId}/${state.folder}/${state.year}/${String(state.chunk).padStart(5, '0')}.json`
  const target = resolve(releaseDirectory, relativePath)
  await mkdir(resolve(target, '..'), { recursive: true })
  await writeFile(target, JSON.stringify(state.records), 'utf8')
  state.files.push({ path: relativePath, count: state.records.length })
  state.records = []
  state.chunk += 1
}

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })

const releaseId = `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`
const states = new Map()
const organizations = new Map()
let totalRecords = 0
let rejected = 0

for await (const row of csvRows()) {
  const code = String(row.cdorgao ?? '').trim()
  const name = String(row.nmorgao ?? '').trim()
  const year = getYear(row.dtlancamento)

  if (!code || !name || !year) {
    rejected += 1
    continue
  }

  const organizationKey = `${code}||${name}`
  const stateKey = `${organizationKey}||${year}`
  let state = states.get(stateKey)

  if (!state) {
    state = {
      releaseId,
      folder: folderName(code),
      year,
      chunk: 1,
      files: [],
      records: [],
    }
    states.set(stateKey, state)
  }

  const record = empenhoFieldKeys.map((field) => String(row[field] ?? ''))
  state.records.push(record)
  if (state.records.length === recordsPerFile) await writeChunk(outputDirectory, state)

  let organization = organizations.get(organizationKey)
  if (!organization) {
    organization = { id: folderName(code), code, name, total: 0, years: new Map() }
    organizations.set(organizationKey, organization)
  }
  organization.total += 1
  organization.years.set(year, (organization.years.get(year) ?? 0) + 1)
  totalRecords += 1
}

for (const state of states.values()) await writeChunk(outputDirectory, state)

const chunksByOrganizationYear = new Map(
  [...states.entries()].map(([key, state]) => [key, state.files]),
)
const manifest = {
  version: 1,
  releaseId,
  generatedAt: new Date().toISOString(),
  sourceFile: basename(source),
  totalRecords,
  rejectedRecords: rejected,
  fields: empenhoFields.map(([key, label, section]) => ({ key, label, section })),
  organizations: [...organizations.entries()]
    .map(([key, organization]) => ({
      id: organization.id,
      code: organization.code,
      name: organization.name,
      total: organization.total,
      years: [...organization.years.entries()]
        .map(([year, count]) => ({
          year,
          count,
          chunks: chunksByOrganizationYear.get(`${key}||${year}`) ?? [],
        }))
        .sort((left, right) => Number(left.year) - Number(right.year)),
    }))
    .sort((left, right) => `${left.code} ${left.name}`.localeCompare(`${right.code} ${right.name}`, 'pt-BR')),
}

await writeFile(resolve(outputDirectory, 'manifest.json'), JSON.stringify(manifest), 'utf8')
console.log(`Preparação concluída: ${totalRecords.toLocaleString('pt-BR')} notas em ${states.size.toLocaleString('pt-BR')} recortes.`)
console.log(`Pasta gerada: ${outputDirectory}`)
if (rejected) console.log(`Registros sem órgão ou ano: ${rejected.toLocaleString('pt-BR')}`)
