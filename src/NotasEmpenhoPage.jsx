import { useEffect, useMemo, useState } from 'react'
import { Building2, CalendarDays, Database, Search } from 'lucide-react'

const storageUrl = String(
  import.meta.env.VITE_EMPENHOS_STORAGE_URL
    ?? 'https://pub-e8acbbb11489485c8b061c0cc8e9811f.r2.dev',
).replace(/\/$/, '')
const fallbackUrl = '/data/empenhos'
const pageSize = 20

function publicUrl(path) {
  return `${storageUrl || fallbackUrl}/${path}`
}

function formatValue(value, key) {
  const text = String(value ?? '').trim()
  if (!text) return 'Não informado'
  if (key !== 'vlempenho') return text
  const amount = Number(text.replaceAll('.', '').replace(',', '.'))
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)
    : text
}

function chunksForPage(chunks, page) {
  const offset = (page - 1) * pageSize
  let scanned = 0
  const selected = []
  for (const chunk of chunks) {
    const end = scanned + chunk.count
    if (end > offset && scanned < offset + pageSize) selected.push({ ...chunk, start: scanned })
    if (scanned >= offset + pageSize) break
    scanned = end
  }
  return { offset, selected }
}

export default function NotasEmpenhoPage() {
  const [manifest, setManifest] = useState(null)
  const [selectedOrg, setSelectedOrg] = useState('all')
  const [years, setYears] = useState([])
  const [search, setSearch] = useState('')
  const [records, setRecords] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(publicUrl('manifest.json')).then(async (response) => {
      if (!response.ok) throw new Error('O catálogo de notas ainda não foi publicado.')
      return response.json()
    }).then((data) => {
      if (!Array.isArray(data.organizations) || !Array.isArray(data.fields)) throw new Error('O catálogo de notas está inválido.')
      setManifest(data)
      setError('')
    }).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false))
  }, [])

  const organizations = useMemo(() => manifest?.organizations ?? [], [manifest])
  const fields = useMemo(() => manifest?.fields ?? [], [manifest])
  const currentOrg = organizations.find((organization) => organization.id === selectedOrg)
  const availableYears = useMemo(() => currentOrg?.years ?? [], [currentOrg])
  const selectedYearEntries = useMemo(
    () => availableYears.filter((entry) => years.includes(entry.year)),
    [availableYears, years],
  )
  const selectedChunks = useMemo(() => selectedYearEntries.flatMap((entry) => entry.chunks ?? []), [selectedYearEntries])
  const resultCount = useMemo(
    () => selectedYearEntries.reduce((sum, entry) => sum + entry.count, 0),
    [selectedYearEntries],
  )
  const totalPages = Math.max(1, Math.ceil(resultCount / pageSize))

  useEffect(() => {
    if (!currentOrg || !years.length) return undefined
    const { offset, selected } = chunksForPage(selectedChunks, page)
    const controller = new AbortController()
    setLoading(true)
    Promise.all(selected.map(async (chunk) => {
      const response = await fetch(publicUrl(chunk.path), { signal: controller.signal })
      if (!response.ok) throw new Error('Não foi possível baixar este recorte da base.')
      return { ...chunk, rows: await response.json() }
    })).then((groups) => {
      const pageRows = groups.flatMap((group) => group.rows.map((row, index) => ({ row, absoluteIndex: group.start + index })))
        .filter((item) => item.absoluteIndex >= offset && item.absoluteIndex < offset + pageSize)
        .map((item) => Object.fromEntries(fields.map((field, index) => [field.key, item.row[index] ?? ''])))
      setRecords(pageRows)
      setError('')
    }).catch((requestError) => { if (requestError.name !== 'AbortError') setError(requestError.message) }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [currentOrg, years, selectedChunks, page, fields])

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    return query ? records.filter((record) => Object.values(record).some((value) => String(value).toLocaleLowerCase('pt-BR').includes(query))) : records
  }, [records, search])

  function changeOrg(nextOrg) { setSelectedOrg(nextOrg); setYears([]); setSearch(''); setPage(1) }
  function toggleYear(year) { setYears((current) => current.includes(year) ? current.filter((item) => item !== year) : [...current, year].sort()); setPage(1) }

  return <section className="notes-shell">
    <header className="notes-header"><div><span className="eyebrow">Despesas públicas · 2022–2026</span><h1>Notas de empenho organizadas</h1><p>Escolha um órgão e um ano para abrir somente as notas necessárias. Cada cartão mostra as 33 colunas originais.</p></div></header>
    <section className="global-context">
      <div className="context-field"><label htmlFor="orgao-empenho"><Building2 size={16} /> Órgão</label><select id="orgao-empenho" value={selectedOrg} onChange={(event) => changeOrg(event.target.value)} disabled={!manifest}><option value="all">Todos os órgãos ({(manifest?.totalRecords ?? 0).toLocaleString('pt-BR')})</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.code} — {organization.name} ({organization.total.toLocaleString('pt-BR')})</option>)}</select></div>
      <div className="context-field"><label htmlFor="busca-empenho"><Search size={16} /> Filtrar a página atual</label><input id="busca-empenho" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nota, credor, contrato..." disabled={!records.length} /></div>
      <fieldset className="context-years" disabled={!currentOrg}><legend><CalendarDays size={16} /> Ano</legend><div>{availableYears.map((entry) => <label key={entry.year}><input type="checkbox" checked={years.includes(entry.year)} onChange={() => toggleYear(entry.year)} />{entry.year}</label>)}</div></fieldset>
    </section>
    <section className="notes-overview"><div><span>Órgão selecionado</span><strong>{currentOrg?.name ?? 'Todos os órgãos'}</strong></div><div><span>Registros encontrados</span><strong>{resultCount.toLocaleString('pt-BR')} notas</strong></div><div><span>Colunas por nota</span><strong>{fields.length || 33} campos</strong></div></section>
    {error ? <section className="empty-records"><Database size={28} /><h2>Não foi possível carregar os registros</h2><p>{error}</p></section> : !currentOrg || !years.length ? <section className="empty-records"><Building2 size={28} /><h2>Escolha um órgão e pelo menos um ano</h2><p>Assim o painel baixa apenas uma pequena parte da base e permanece rápido no Vercel.</p></section> : <><section className="agency-group"><div className="agency-heading"><div><span className="eyebrow">PÁGINA {page} DE {totalPages}</span><h2>{currentOrg.code} — {currentOrg.name}</h2></div><span>{loading ? 'Carregando...' : `${visibleRecords.length} notas nesta página`}</span></div><div className="note-grid">{visibleRecords.map((record, index) => <article className="commitment-card" key={`${record.nunotaempenho}-${record.dtlancamento}-${index}`}><header><div><span>NOTA DE EMPENHO</span><h3>{formatValue(record.nunotaempenho, 'nunotaempenho')}</h3><p>{formatValue(record.nmtipoempenho, 'nmtipoempenho')} · {formatValue(record.dtlancamento, 'dtlancamento')}</p></div><strong>{formatValue(record.vlempenho, 'vlempenho')}</strong></header>{[...new Set(fields.map((field) => field.section))].map((section) => { const sectionFields = fields.filter((field) => field.section === section); return <section className={`field-section ${section === 'Histórico' ? 'history' : ''}`} key={section}><h4>{section}</h4>{section === 'Histórico' ? <p>{formatValue(record.dehistoricoempenho, 'dehistoricoempenho')}</p> : <dl>{sectionFields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{formatValue(record[field.key], field.key)}</dd></div>)}</dl>}</section> })}</article>)}</div></section>{!loading && resultCount > 0 && <nav className="pager" aria-label="Paginação das notas"><button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><span>Página {page} de {totalPages}</span><button type="button" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)}>Próxima</button></nav>}</>}
  </section>
}
