import { createReadStream } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const csvPath = 'C:/Users/rgoes/Downloads/base de dados notas de empenho poder executivo 2022 a 2026 (1).csv'
let organizationCache

async function* recordsFromCsv() {
  let header; let row = []; let cell = ''; let quoted = false
  for await (const chunk of createReadStream(csvPath, { encoding: 'latin1' })) {
    for (let index = 0; index < chunk.length; index += 1) {
      const char = chunk[index]; const next = chunk[index + 1]
      if (char === '"' && quoted && next === '"') { cell += '"'; index += 1 }
      else if (char === '"') quoted = !quoted
      else if (char === ';' && !quoted) { row.push(cell); cell = '' }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') index += 1
        row.push(cell); cell = ''
        if (!header) header = row
        else if (row.some((value) => value !== '')) yield Object.fromEntries(header.map((key, column) => [key, row[column] ?? '']))
        row = []
      } else cell += char
    }
  }
}

async function organizations() {
  if (organizationCache) return organizationCache
  const groups = new Map()
  for await (const record of recordsFromCsv()) {
    if (!/^\d+$/.test(String(record.cdorgao)) || !record.nmorgao) continue
    const key = `${record.cdorgao}|${record.nmorgao}`
    const group = groups.get(key) ?? { key, code: record.cdorgao, name: record.nmorgao, count: 0, years: new Set() }
    group.count += 1
    const year = String(record.dtlancamento ?? '').match(/20\d{2}/)?.[0]
    if (year) group.years.add(year)
    groups.set(key, group)
  }
  organizationCache = [...groups.values()].map((group) => ({ ...group, years: [...group.years].sort() })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return organizationCache
}

const api = async (req, res, next) => {
  if (!req.url?.startsWith('/api/empenhos')) return next()
  try {
    const url = new URL(req.url, 'http://localhost')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (url.pathname === '/api/empenhos/orgaos') { res.end(JSON.stringify(await organizations())); return }
    const organization = url.searchParams.get('org')
    if (!organization) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Informe o órgão.' })); return }
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1)); const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 20))); const years = new Set(url.searchParams.getAll('year')); const search = String(url.searchParams.get('search') ?? '').toLocaleLowerCase('pt-BR')
    const groups = await organizations()
    const knownTotal = !years.size && !search ? (organization === 'all' ? groups.reduce((sum, group) => sum + group.count, 0) : groups.find((group) => group.key === organization)?.count) : undefined
    const records = []; let total = 0
    for await (const record of recordsFromCsv()) {
      if (organization !== 'all' && `${record.cdorgao}|${record.nmorgao}` !== organization) continue
      if (years.size && !years.has(String(record.dtlancamento ?? '').match(/20\d{2}/)?.[0])) continue
      if (search && !Object.values(record).some((value) => String(value).toLocaleLowerCase('pt-BR').includes(search))) continue
      if (total >= (page - 1) * pageSize && records.length < pageSize) records.push(record)
      total += 1
      if (knownTotal !== undefined && records.length === pageSize) break
    }
    res.end(JSON.stringify({ records, total: knownTotal ?? total, page, pageSize }))
  } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: error.message })) }
}

const empenhosApi = () => ({
  name: 'empenhos-api',
  configureServer(server) { server.middlewares.use(api) },
  configurePreviewServer(server) { server.middlewares.use(api) },
})
export default defineConfig({ plugins: [react(), empenhosApi()] })
