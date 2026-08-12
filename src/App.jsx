import { useEffect, useMemo, useState } from 'react'
import createPlotlyComponent from 'react-plotly.js/factory'
import Plotly from 'plotly.js-dist-min'
import * as XLSX from 'xlsx'
import {
  ArrowDownUp,
  Building2,
  ChevronDown,
  Database,
  FileWarning,
  Search,
  TrendingUp,
} from 'lucide-react'
import './App.css'
import NotasEmpenhoPage from './NotasEmpenhoPage.jsx'

const Plot = createPlotlyComponent(Plotly)

const DATA_URL = '/data/DADOS_ORGAOS_2022_2026.xlsx'
const YEAR_RANGE = [2022, 2023, 2024, 2025, 2026]

const plotConfig = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  toImageButtonOptions: {
    format: 'png',
    filename: 'grafico-despesas-publicas',
    scale: 2,
  },
}

const palette = [
  '#4c72b0',
  '#dd8452',
  '#55a868',
  '#c44e52',
  '#8172b3',
  '#937860',
  '#da8bc3',
  '#8c8c8c',
  '#ccb974',
  '#64b5cd',
]

const greenPalette = [
  '#bbf7d0',
  '#86efac',
  '#4ade80',
  '#22c55e',
  '#16a34a',
  '#15803d',
  '#166534',
  '#14532d',
]

const yearColors = {
  2022: '#dcfce7',
  2023: '#86efac',
  2024: '#22c55e',
  2025: '#166534',
  2026: '#022c22',
}

const categoryColors = {
  'Despesas Correntes': '#16a34a',
  'Despesas de Capital': '#86efac',
}

const defaultChartUnits = {
  category: 'millions',
  groupNature: 'millions',
  topLine: 'millions',
  topAccumulated: 'billions',
  heatmap: 'millions',
}

function getUnitMeta(unit) {
  return unit === 'billions'
    ? {
        divisor: 1000,
        label: 'R$ Bilhões',
        shortLabel: 'bi',
        decimals: 2,
        buttonLabel: 'Bilhões',
      }
    : {
        divisor: 1,
        label: 'R$ Milhões',
        shortLabel: 'M',
        decimals: 1,
        buttonLabel: 'Milhões',
      }
}

function moneyMillions(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 1,
  }).format(value)
}

function compactMillions(value) {
  return `${moneyMillions(value)}\u00A0M`
}

function scaledValue(valueInMillions, unit) {
  return valueInMillions / getUnitMeta(unit).divisor
}

function formatByUnit(valueInMillions, unit) {
  const meta = getUnitMeta(unit)
  return `${new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: meta.decimals,
  }).format(scaledValue(valueInMillions, unit))}\u00A0${meta.shortLabel}`
}

function valueAxis(unit, titlePrefix = 'Valor liquidado') {
  const meta = getUnitMeta(unit)
  return {
    title: `${titlePrefix} (${meta.label})`,
    tickprefix: 'R$ ',
    ticksuffix: ` ${meta.shortLabel}`,
    gridcolor: '#e6eaf0',
    zerolinecolor: '#d6dbe4',
  }
}

function UnitToggle({ value, onChange }) {
  return (
    <div className="unit-toggle" aria-label="Selecionar unidade do gráfico">
      {[
        ['millions', 'Milhões'],
        ['billions', 'Bilhões'],
      ].map(([unit, label]) => (
        <button
          type="button"
          key={unit}
          className={value === unit ? 'active' : ''}
          onClick={() => onChange(unit)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function normalizeHeader(header) {
  return String(header)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function valueByHeader(row, headers) {
  const normalizedRow = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  )

  for (const header of headers) {
    const value = normalizedRow[normalizeHeader(header)]
    if (value !== undefined && value !== null) {
      return value
    }
  }

  return null
}

function normalizeRow(row) {
  const valorLiquidado = valueByHeader(row, [
    'VLR LIQUIDADO',
    'VALOR LIQUIDADO',
  ])

  return {
    ano: Number(valueByHeader(row, ['ANO'])),
    codOrgao: String(
      valueByHeader(row, ['COD. ORGAO', 'COD ORGAO', 'CÓD. ÓRGÃO']) ?? '',
    ).trim(),
    orgao: String(valueByHeader(row, ['ORGAO', 'ÓRGÃO']) ?? '').trim(),
    categoria: String(
      valueByHeader(row, ['CATEGORIA']) ?? 'Nao informado',
    ).trim(),
    grupo: String(
      valueByHeader(row, ['GRUPO NAT. DESP.', 'GRUPO NAT DESP']) ??
        'Nao informado',
    ).trim(),
    elemento: String(valueByHeader(row, ['ELEMENTO']) ?? 'Nao informado').trim(),
    valor: Number(valorLiquidado ?? 0),
    valorMilhoes: Number(valorLiquidado ?? 0) / 1_000_000,
  }
}

function groupSum(rows, keys) {
  const map = new Map()

  rows.forEach((row) => {
    const compoundKey = keys.map((key) => row[key]).join('||')
    const current = map.get(compoundKey) ?? {
      ...Object.fromEntries(keys.map((key) => [key, row[key]])),
      valorMilhoes: 0,
    }

    current.valorMilhoes += row.valorMilhoes
    map.set(compoundKey, current)
  })

  return Array.from(map.values())
}

function getChartLayout(title, extra = {}) {
  return {
    title: {
      text: title,
      font: { size: 17, color: '#172033' },
      x: 0,
      xanchor: 'left',
    },
    autosize: true,
    margin: { t: 58, r: 24, b: 62, l: 76 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, Segoe UI, system-ui, sans-serif', color: '#526071' },
    legend: { orientation: 'h', y: -0.28, x: 0 },
    hoverlabel: { bgcolor: '#101828', font: { color: '#ffffff' } },
    yaxis: {
      title: 'Valor liquidado',
      tickprefix: 'R$ ',
      ticksuffix: ' M',
      gridcolor: '#e6eaf0',
      zerolinecolor: '#d6dbe4',
    },
    xaxis: {
      type: 'category',
      gridcolor: '#edf1f5',
    },
    ...extra,
  }
}

function buildGroupedBarData(rows, dimension, unit, years = YEAR_RANGE) {
  const grouped = groupSum(rows, ['ano', dimension])
  const labels = [...new Set(grouped.map((row) => row[dimension]))].sort()

  return labels.map((label, index) => {
    const values = years.map((year) => {
      return (
        grouped.find((row) => row.ano === year && row[dimension] === label)
          ?.valorMilhoes ?? 0
      )
    })

    return {
      type: 'bar',
      name: label,
      x: years,
      y: values.map((value) => scaledValue(value, unit)),
      customdata: values.map((value) => formatByUnit(value, unit)),
      marker: { color: palette[index % palette.length] },
      hovertemplate:
        '<b>%{fullData.name}</b><br>Ano: %{x}<br>Valor: %{customdata}<extra></extra>',
    }
  })
}

function buildCategoryBarData(rows, unit, years = YEAR_RANGE) {
  const grouped = groupSum(rows, ['ano', 'categoria'])
  const labels = ['Despesas Correntes', 'Despesas de Capital'].filter((label) =>
    grouped.some((row) => row.categoria === label),
  )
  const remainingLabels = [
    ...new Set(grouped.map((row) => row.categoria)),
  ].filter((label) => !labels.includes(label))

  return [...labels, ...remainingLabels].map((label, index) => {
    const values = years.map((year) => {
      return (
        grouped.find((row) => row.ano === year && row.categoria === label)
          ?.valorMilhoes ?? 0
      )
    })

    return {
      type: 'bar',
      name: label,
      x: years,
      y: values.map((value) => scaledValue(value, unit)),
      customdata: values.map((value) => formatByUnit(value, unit)),
      marker: {
        color: categoryColors[label] ?? greenPalette[index % greenPalette.length],
      },
      hovertemplate:
        '<b>%{fullData.name}</b><br>Ano: %{x}<br>Valor: %{customdata}<extra></extra>',
    }
  })
}

function buildLineData(names, evolution, unit, years = YEAR_RANGE) {
  return names.map((elemento, index) => ({
    type: 'scatter',
    mode: 'lines+markers',
    name: elemento,
    x: years,
    y: (evolution[index] ?? []).map((value) => scaledValue(value, unit)),
    customdata: (evolution[index] ?? []).map((value) =>
      formatByUnit(value, unit),
    ),
    line: { color: palette[index % palette.length], width: 2.4 },
    marker: { color: palette[index % palette.length], size: 8 },
    hovertemplate:
      '<b>%{fullData.name}</b><br>Ano: %{x}<br>Valor: %{customdata}<extra></extra>',
  }))
}

function buildElementYearBars(rows, unit, years = YEAR_RANGE) {
  const grouped = groupSum(rows, ['ano', 'elemento'])
  const elementTotals = groupSum(rows, ['elemento']).sort(
    (a, b) => b.valorMilhoes - a.valorMilhoes,
  )
  const topElements = elementTotals
    .sort((a, b) => b.valorMilhoes - a.valorMilhoes)
    .slice(0, 7)
    .map((row) => row.elemento)
  const otherCount = Math.max(elementTotals.length - topElements.length, 0)
  const otherLabel =
    otherCount > 0 ? `Outros (Demais ${otherCount} Elementos)` : 'Outros'
  const elements = otherCount > 0 ? [...topElements, otherLabel] : topElements

  return years.map((year, index) => {
    const displayElements = [...elements].reverse()
    const values = displayElements.map((elemento) => {
      if (elemento === otherLabel) {
        return rows
          .filter((row) => row.ano === year && !topElements.includes(row.elemento))
          .reduce((sum, row) => sum + row.valorMilhoes, 0)
      }

      return (
        grouped.find((row) => row.ano === year && row.elemento === elemento)
          ?.valorMilhoes ?? 0
      )
    })

    return {
      type: 'bar',
      orientation: 'h',
      name: String(year),
      x: values.map((value) => scaledValue(value, unit)),
      y: displayElements,
      customdata: values.map((value) => formatByUnit(value, unit)),
      text: values.map((value) =>
        scaledValue(value, unit).toLocaleString('pt-BR', {
          maximumFractionDigits: getUnitMeta(unit).decimals,
        }),
      ),
      textposition: 'outside',
      textfont: { color: '#172033', size: 11, weight: 800 },
      cliponaxis: false,
      marker: { color: yearColors[year] ?? greenPalette[index] },
      hovertemplate:
        '<b>%{y}</b><br>Ano: %{fullData.name}<br>Valor: %{customdata}<extra></extra>',
    }
  })
}

function App() {
  const [rows, setRows] = useState([])
  const [selectedOrg, setSelectedOrg] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortConfig, setSortConfig] = useState({
    key: 'valorMilhoes',
    direction: 'desc',
  })
  const [chartUnits, setChartUnits] = useState(defaultChartUnits)
  const [summaryUnit, setSummaryUnit] = useState('millions')
  const [selectedYears, setSelectedYears] = useState(YEAR_RANGE)
  const [viewMode, setViewMode] = useState('dashboard')

  function setChartUnit(chartId, unit) {
    setChartUnits((current) => ({
      ...current,
      [chartId]: unit,
    }))
  }

  function toggleYear(year) {
    setSelectedYears((current) => {
      if (current.includes(year)) {
        return current.length === 1 ? current : current.filter((item) => item !== year)
      }

      return [...current, year].sort((a, b) => a - b)
    })
  }

  useEffect(() => {
    async function loadWorkbook() {
      try {
        const response = await fetch(DATA_URL)

        if (!response.ok) {
          throw new Error(
            `Arquivo Excel não encontrado em ${DATA_URL}. Verifique se ele está em public/data.`,
          )
        }

        const buffer = await response.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const parsedRows = XLSX.utils
          .sheet_to_json(firstSheet, { defval: null })
          .map(normalizeRow)
          .filter(
            (row) =>
              row.ano &&
              row.codOrgao &&
              row.orgao &&
              Number.isFinite(row.valorMilhoes),
          )

        if (!parsedRows.length) {
          throw new Error('A planilha foi carregada, mas não há dados válidos.')
        }

        setRows(parsedRows)
        const firstOrg = [...parsedRows]
          .sort((a, b) => a.orgao.localeCompare(b.orgao, 'pt-BR'))[0]
        setSelectedOrg(`${firstOrg.codOrgao}||${firstOrg.orgao}`)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadWorkbook()
  }, [])

  const orgOptions = useMemo(() => {
    const map = new Map()
    rows.forEach((row) => {
      map.set(`${row.codOrgao}||${row.orgao}`, {
        value: `${row.codOrgao}||${row.orgao}`,
        label: `${row.codOrgao} - ${row.orgao}`,
      })
    })

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR'),
    )
  }, [rows])

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          `${row.codOrgao}||${row.orgao}` === selectedOrg &&
          selectedYears.includes(row.ano),
      ),
    [rows, selectedOrg, selectedYears],
  )

  const selectedLabel =
    orgOptions.find((option) => option.value === selectedOrg)?.label ?? ''

  const annualTotals = useMemo(() => {
    const totals = Object.fromEntries(YEAR_RANGE.map((year) => [year, 0]))
    filteredRows.forEach((row) => {
      totals[row.ano] = (totals[row.ano] ?? 0) + row.valorMilhoes
    })
    return totals
  }, [filteredRows])

  const totalPeriod = useMemo(
    () => Object.values(annualTotals).reduce((sum, value) => sum + value, 0),
    [annualTotals],
  )

  const topElements = useMemo(() => {
    return groupSum(filteredRows, ['elemento'])
      .sort((a, b) => b.valorMilhoes - a.valorMilhoes)
      .slice(0, 10)
  }, [filteredRows])

  const topElementNames = useMemo(
    () => topElements.map((row) => row.elemento),
    [topElements],
  )

  const topElementEvolution = useMemo(() => {
    const grouped = groupSum(
      filteredRows.filter((row) => topElementNames.includes(row.elemento)),
      ['ano', 'elemento'],
    )

    return topElementNames.map((elemento) =>
      selectedYears.map(
        (year) =>
          grouped.find((row) => row.ano === year && row.elemento === elemento)
            ?.valorMilhoes ?? 0,
      ),
    )
  }, [filteredRows, selectedYears, topElementNames])

  const heatmapUnit = chartUnits.heatmap
  const heatmapMax = Math.max(0, ...topElementEvolution.flat())
  const heatmapZ = topElementEvolution.map((row) =>
    row.map((value) => scaledValue(value, heatmapUnit)),
  )
  const heatmapText = topElementEvolution.map((row) =>
    row.map((value) =>
      scaledValue(value, heatmapUnit).toLocaleString('pt-BR', {
        maximumFractionDigits: getUnitMeta(heatmapUnit).decimals,
      }),
    ),
  )
  const heatmapTextColors = topElementEvolution.map((row) =>
    row.map((value) => (heatmapMax > 0 && value / heatmapMax > 0.48 ? '#ffffff' : '#172033')),
  )

  const groupedBarSections = useMemo(() => {
    return groupSum(filteredRows, ['grupo'])
      .sort((a, b) => b.valorMilhoes - a.valorMilhoes)
      .map((group) => ({
        grupo: group.grupo,
        total: group.valorMilhoes,
        rows: filteredRows.filter((row) => row.grupo === group.grupo),
      }))
  }, [filteredRows])

  const tableRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const aValue = a[sortConfig.key]
      const bValue = b[sortConfig.key]
      const direction = sortConfig.direction === 'asc' ? 1 : -1

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * direction
      }

      return String(aValue).localeCompare(String(bValue), 'pt-BR') * direction
    })
  }, [filteredRows, sortConfig])

  function handleSort(key) {
    setSortConfig((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  if (loading) {
    return (
      <main className="app-shell center-state">
        <Database size={36} />
        <h1>Carregando dados orçamentários</h1>
      </main>
    )
  }

  if (error) {
    return (
      <main className="app-shell center-state error-state">
        <FileWarning size={40} />
        <h1>Não foi possível abrir a base</h1>
        <p>{error}</p>
      </main>
    )
  }

  return (
    <main className="app-shell">
      {viewMode === 'dashboard' && <header className="dashboard-header">
        <div>
          <span className="eyebrow">Despesas públicas 2022-2026</span>
          <h1>Composição e evolução por órgão</h1>
          <p>{selectedLabel}</p>
        </div>
        <div className="filter-panel" aria-label="Filtro global por órgão">
          <label htmlFor="orgao">
            <Building2 size={18} />
            Órgão
          </label>
          <div className="select-wrap">
            <Search size={18} aria-hidden="true" />
            <select
              id="orgao"
              value={selectedOrg}
              onChange={(event) => setSelectedOrg(event.target.value)}
            >
              {orgOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="year-filter" aria-label="Filtro principal por periodo">
            <legend>Periodo</legend>
            <div className="year-options">
              {YEAR_RANGE.map((year) => (
                <label key={year}>
                  <input
                    type="checkbox"
                    checked={selectedYears.includes(year)}
                    onChange={() => toggleYear(year)}
                  />
                  {year}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </header>}

      <nav className="page-nav" aria-label="Páginas do painel">
        <button
          type="button"
          className={viewMode === 'dashboard' ? 'active' : ''}
          onClick={() => setViewMode('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={viewMode === 'empenhos' ? 'active' : ''}
          onClick={() => setViewMode('empenhos')}
        >
          Notas de empenho
        </button>
      </nav>

      {viewMode === 'empenhos' ? <NotasEmpenhoPage /> : <>
      <section className="summary-section" aria-label="Resumo anual">
        <div className="summary-toolbar">
          <span>Resumo do periodo selecionado</span>
          <UnitToggle value={summaryUnit} onChange={setSummaryUnit} />
        </div>
        <div className="summary-strip">
          <article className="kpi-card total-card">
            <div>
              <span>Total liquidado</span>
              <strong>{formatByUnit(totalPeriod, summaryUnit)}</strong>
            </div>
            <TrendingUp size={28} />
          </article>
          {selectedYears.map((year) => (
            <article className="kpi-card" key={year}>
              <span>{year}</span>
              <strong>{formatByUnit(annualTotals[year] ?? 0, summaryUnit)}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="chart-grid">
        <div className="chart-panel">
          <UnitToggle
            value={chartUnits.category}
            onChange={(unit) => setChartUnit('category', unit)}
          />
          <Plot
            data={buildCategoryBarData(filteredRows, chartUnits.category, selectedYears)}
            layout={getChartLayout('Evolução por categoria econômica', {
              barmode: 'group',
              yaxis: valueAxis(chartUnits.category),
            })}
            config={plotConfig}
            useResizeHandler
            className="plot"
          />
        </div>

        <div className="chart-panel">
          <UnitToggle
            value={chartUnits.groupNature}
            onChange={(unit) => setChartUnit('groupNature', unit)}
          />
          <Plot
            data={buildGroupedBarData(
              filteredRows,
              'grupo',
              chartUnits.groupNature,
              selectedYears,
            )}
            layout={getChartLayout(
              'Evolução por grupo de natureza da despesa',
              { barmode: 'group', yaxis: valueAxis(chartUnits.groupNature) },
            )}
            config={plotConfig}
            useResizeHandler
            className="plot"
          />
        </div>

        <div className="chart-panel chart-panel-wide">
          <UnitToggle
            value={chartUnits.topLine}
            onChange={(unit) => setChartUnit('topLine', unit)}
          />
          <Plot
            data={buildLineData(
              topElementNames,
              topElementEvolution,
              chartUnits.topLine,
              selectedYears,
            )}
            layout={getChartLayout(
              `Evolução Anual dos Top 10 Elementos de Despesa (${getUnitMeta(chartUnits.topLine).label})`,
              {
                margin: { t: 58, r: 300, b: 62, l: 82 },
                legend: { x: 1.04, y: 1, xanchor: 'left', yanchor: 'top' },
                xaxis: {
                  title: 'Ano',
                  type: 'category',
                  gridcolor: '#d7d7d7',
                  showgrid: true,
                },
                yaxis: {
                  ...valueAxis(chartUnits.topLine, 'Valor Liquidado'),
                  gridcolor: '#d0d0d0',
                  zerolinecolor: '#d0d0d0',
                },
              },
            )}
            config={plotConfig}
            useResizeHandler
            className="plot line-plot"
          />
        </div>

        <div className="chart-panel chart-panel-wide top-elements-panel">
          <UnitToggle
            value={chartUnits.topAccumulated}
            onChange={(unit) => setChartUnit('topAccumulated', unit)}
          />
          <Plot
            data={[
              {
                type: 'bar',
                orientation: 'h',
                x: [...topElements]
                  .reverse()
                  .map((row) =>
                    scaledValue(row.valorMilhoes, chartUnits.topAccumulated),
                  ),
                y: [...topElements].reverse().map((row) => row.elemento),
                customdata: [...topElements]
                  .reverse()
                  .map((row) =>
                    formatByUnit(row.valorMilhoes, chartUnits.topAccumulated),
                  ),
                marker: { color: '#0f766e' },
                hovertemplate:
                  '<b>%{y}</b><br>Valor acumulado: %{customdata}<extra></extra>',
              },
            ]}
            layout={getChartLayout('Top 10 elementos de despesa acumulado', {
              margin: { t: 58, r: 42, b: 68, l: 330 },
              height: 460,
              xaxis: valueAxis(
                chartUnits.topAccumulated,
                'Valor liquidado acumulado',
              ),
              yaxis: { automargin: true },
              showlegend: false,
            })}
            config={plotConfig}
            useResizeHandler
            className="plot top-elements-plot"
          />
        </div>

        <div className="chart-panel chart-panel-wide heatmap-panel">
          <UnitToggle
            value={chartUnits.heatmap}
            onChange={(unit) => setChartUnit('heatmap', unit)}
          />
          <Plot
            data={[
              {
                type: 'heatmap',
                x: selectedYears,
                y: topElementNames,
                z: heatmapZ,
                text: heatmapText,
                texttemplate: '%{text}',
                textfont: { color: heatmapTextColors, size: 12 },
                customdata: topElementEvolution.map((row) =>
                  row.map((value) => formatByUnit(value, chartUnits.heatmap)),
                ),
                colorscale: [
                  [0, '#f0fdf4'],
                  [0.2, '#bbf7d0'],
                  [0.4, '#86efac'],
                  [0.6, '#22c55e'],
                  [0.8, '#15803d'],
                  [1, '#064e3b'],
                ],
                reversescale: false,
                xgap: 1,
                ygap: 1,
                colorbar: { title: getUnitMeta(chartUnits.heatmap).label },
                hovertemplate:
                  '<b>%{y}</b><br>Ano: %{x}<br>Valor: %{customdata}<extra></extra>',
              },
            ]}
            layout={getChartLayout(
              `Matriz de Evolução: Top 10 Elementos de Despesa (${getUnitMeta(chartUnits.heatmap).label})`,
              {
                margin: { t: 58, r: 120, b: 62, l: 330 },
                xaxis: { title: 'Ano', type: 'category', side: 'bottom' },
                yaxis: {
                  title: 'Elemento de Despesa',
                  automargin: true,
                  autorange: 'reversed',
                },
                showlegend: false,
              },
            )}
            config={plotConfig}
            useResizeHandler
            className="plot heatmap-plot"
          />
        </div>
      </section>

      <section className="group-section">
        <div className="section-title">
          <div>
            <span className="eyebrow">Elementos por grupo</span>
            <h2>Valores liquidados por ano</h2>
          </div>
          <p>{groupedBarSections.length} grupos</p>
        </div>

        <div className="group-list">
          {groupedBarSections.map((group, index) => (
            <details className="group-details" key={group.grupo} open={index === 0}>
              <summary>
                <span>
                  <ChevronDown size={18} />
                  {group.grupo}
                </span>
                <strong>{compactMillions(group.total)}</strong>
              </summary>
              <div className="group-chart-controls">
                <UnitToggle
                  value={chartUnits[`group:${group.grupo}`] ?? 'millions'}
                  onChange={(unit) => setChartUnit(`group:${group.grupo}`, unit)}
                />
              </div>
              <Plot
                data={buildElementYearBars(
                  group.rows,
                  chartUnits[`group:${group.grupo}`] ?? 'millions',
                  selectedYears,
                )}
                layout={getChartLayout(
                  `Despesas por elemento - Top 7 + Outros | ${group.grupo}`,
                  {
                    barmode: 'group',
                    height: 600,
                    bargap: 0.18,
                    bargroupgap: 0.08,
                    margin: { t: 72, r: 56, b: 84, l: 340 },
                    legend: {
                      title: { text: 'Ano do Exercício' },
                      orientation: 'v',
                      y: 1,
                      x: 1.02,
                      xanchor: 'left',
                      yanchor: 'top',
                    },
                    xaxis: {
                      ...valueAxis(
                        chartUnits[`group:${group.grupo}`] ?? 'millions',
                        'Valor Liquidado',
                      ),
                      gridcolor: '#d8dee6',
                      zerolinecolor: '#cbd5e1',
                    },
                    yaxis: {
                      title: '',
                      automargin: true,
                    },
                  },
                )}
                config={plotConfig}
                useResizeHandler
                className="plot group-plot"
              />
            </details>
          ))}
        </div>
      </section>

      <section className="data-section">
        <div className="section-title">
          <div>
            <span className="eyebrow">Base filtrada</span>
            <h2>Tabela de dados</h2>
          </div>
          <p>{tableRows.length.toLocaleString('pt-BR')} registros</p>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  ['ano', 'Ano'],
                  ['categoria', 'Categoria'],
                  ['grupo', 'Grupo'],
                  ['elemento', 'Elemento'],
                  ['valorMilhoes', 'Valor'],
                ].map(([key, label]) => (
                  <th key={key}>
                    <button type="button" onClick={() => handleSort(key)}>
                      {label}
                      <ArrowDownUp size={14} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, index) => (
                <tr
                  key={`${row.ano}-${row.categoria}-${row.grupo}-${row.elemento}-${index}`}
                >
                  <td>{row.ano}</td>
                  <td>{row.categoria}</td>
                  <td>{row.grupo}</td>
                  <td>{row.elemento}</td>
                  <td>{compactMillions(row.valorMilhoes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </>}
    </main>
  )
}

export default App
