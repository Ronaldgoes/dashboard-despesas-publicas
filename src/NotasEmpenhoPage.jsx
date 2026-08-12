import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  Database,
  Search,
  Warehouse,
} from "lucide-react";

const storageUrl = String(
  import.meta.env.VITE_EMPENHOS_STORAGE_URL ??
    "https://pub-e8acbbb11489485c8b061c0cc8e9811f.r2.dev",
).replace(/\/$/, "");
const fallbackUrl = "/data/empenhos";
const pageSize = 20;
const publicUrl = (path) => `${storageUrl || fallbackUrl}/${path}`;
const normalizeSearch = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const matchesSearch = (record, query) =>
  normalizeSearch(query)
    .split(" ")
    .filter(Boolean)
    .every((word) =>
      normalizeSearch(Object.values(record).join(" ")).includes(word),
    );

const amountFromValue = (value) => {
  const text = String(value ?? "").replace(/[^0-9,.-]/g, "").trim();
  if (!text) return 0;
  const normalized = text.includes(",")
    ? text.replaceAll(".", "").replace(",", ".")
    : text;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amountFromValue(value));

const elementFromSubelement = (value) => {
  const code = String(value ?? "").replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) return "Não informado";
  return `${code.slice(0, 1)}.${code.slice(1, 2)}.${code.slice(2, 4)}.${code.slice(4, 6)}`;
};

function formatValue(value, key) {
  const text = String(value ?? "").trim();
  if (!text) return "Não informado";
  if (key !== "vlempenho") return text;
  return formatCurrency(text);
}

function chunksForPage(chunks, page) {
  const offset = (page - 1) * pageSize;
  let scanned = 0;
  const selected = [];
  for (const chunk of chunks) {
    const end = scanned + chunk.count;
    if (end > offset && scanned < offset + pageSize)
      selected.push({ ...chunk, start: scanned });
    if (scanned >= offset + pageSize) break;
    scanned = end;
  }
  return { offset, selected };
}

async function fetchChunks(chunks, fields, signal) {
  const records = [];
  let nextChunk = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, chunks.length) }, async () => {
      while (nextChunk < chunks.length) {
        const chunk = chunks[nextChunk];
        nextChunk += 1;
        const response = await fetch(publicUrl(chunk.path), { signal });
        if (!response.ok)
          throw new Error("Não foi possível baixar este recorte da base.");
        const rows = await response.json();
        records.push(
          ...rows.map((row) =>
            Object.fromEntries(
              fields.map((field, index) => [field.key, row[index] ?? ""]),
            ),
          ),
        );
      }
    }),
  );
  return records;
}

export default function NotasEmpenhoPage() {
  const [manifest, setManifest] = useState(null);
  const [selectedOrg, setSelectedOrg] = useState("all");
  const [years, setYears] = useState([]);
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [records, setRecords] = useState([]);
  const [allScopeRecords, setAllScopeRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(publicUrl("manifest.json"))
      .then(async (response) => {
        if (!response.ok)
          throw new Error("O catálogo de notas ainda não foi publicado.");
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data.organizations) || !Array.isArray(data.fields))
          throw new Error("O catálogo de notas está inválido.");
        setManifest(data);
        setError("");
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);
  const organizations = useMemo(
    () => manifest?.organizations ?? [],
    [manifest],
  );
  const fields = useMemo(() => manifest?.fields ?? [], [manifest]);
  const currentOrg = organizations.find(
    (organization) => organization.id === selectedOrg,
  );
  const allYears = useMemo(() => {
    const byYear = new Map();
    organizations.forEach((organization) =>
      organization.years.forEach((entry) => {
        const current = byYear.get(entry.year) ?? {
          year: entry.year,
          count: 0,
          chunks: [],
          units: [],
        };
        current.count += entry.count;
        current.chunks.push(...(entry.chunks ?? []));
        current.units.push(...(entry.units ?? []));
        byYear.set(entry.year, current);
      }),
    );
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }, [organizations]);
  const scopeOrg = useMemo(
    () =>
      selectedOrg === "all"
        ? {
            id: "all",
            code: "Todos os órgãos",
            name: "Todos os órgãos",
            years: allYears,
          }
        : currentOrg,
    [selectedOrg, currentOrg, allYears],
  );
  const availableYears = useMemo(() => scopeOrg?.years ?? [], [scopeOrg]);
  const selectedYearEntries = useMemo(
    () => availableYears.filter((entry) => years.includes(entry.year)),
    [availableYears, years],
  );
  const selectedChunks = useMemo(
    () => selectedYearEntries.flatMap((entry) => entry.chunks ?? []),
    [selectedYearEntries],
  );
  const availableUnits = useMemo(() => {
    const map = new Map();
    selectedYearEntries.forEach((entry) =>
      (entry.units ?? []).forEach((unit) => {
        const current = map.get(unit.id) ?? { ...unit, count: 0 };
        current.count += unit.count;
        map.set(unit.id, current);
      }),
    );
    return [...map.values()].sort((a, b) =>
      `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, "pt-BR"),
    );
  }, [selectedYearEntries]);
  const fullMode = Boolean(searchQuery.trim() || selectedUnits.length);
  const baseCount = selectedYearEntries.reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
  const baseTotalValue = selectedYearEntries.reduce(
    (sum, entry) => sum + amountFromValue(entry.totalValue),
    0,
  );
  useEffect(() => {
    if (!scopeOrg || !years.length || !fullMode) {
      setAllScopeRecords([]);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    fetchChunks(selectedChunks, fields, controller.signal)
      .then((data) => {
        setAllScopeRecords(data);
        setError("");
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [scopeOrg, years, fullMode, selectedChunks, fields]);
  useEffect(() => {
    if (!scopeOrg || !years.length || fullMode) return undefined;
    const { offset, selected } = chunksForPage(selectedChunks, page);
    const controller = new AbortController();
    setLoading(true);
    Promise.all(
      selected.map(async (chunk) => {
        const response = await fetch(publicUrl(chunk.path), {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error("Não foi possível baixar este recorte da base.");
        return { ...chunk, rows: await response.json() };
      }),
    )
      .then((groups) => {
        setRecords(
          groups
            .flatMap((group) =>
              group.rows.map((row, index) => ({
                row,
                absoluteIndex: group.start + index,
              })),
            )
            .filter(
              (item) =>
                item.absoluteIndex >= offset &&
                item.absoluteIndex < offset + pageSize,
            )
            .map((item) =>
              Object.fromEntries(
                fields.map((field, index) => [
                  field.key,
                  item.row[index] ?? "",
                ]),
              ),
            ),
        );
        setError("");
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [scopeOrg, years, fullMode, selectedChunks, page, fields]);
  const matchingRecords = useMemo(
    () =>
      (fullMode ? allScopeRecords : records).filter(
        (record) =>
          (!selectedUnits.length ||
            selectedUnits.includes(
              encodeURIComponent(
                `${record.cdunidadegestora}||${record.nmunidadegestora}`,
              ),
            )) &&
          matchesSearch(record, searchQuery),
      ),
    [allScopeRecords, fullMode, records, searchQuery, selectedUnits],
  );
  const resultCount = fullMode ? matchingRecords.length : baseCount;
  const totalNotesValue = fullMode
    ? matchingRecords.reduce(
        (sum, record) => sum + amountFromValue(record.vlempenho),
        0,
      )
    : baseTotalValue;
  const totalPages = Math.max(1, Math.ceil(resultCount / pageSize));
  const visibleRecords = fullMode
    ? matchingRecords.slice((page - 1) * pageSize, page * pageSize)
    : matchingRecords;
  const recordsByUnit = useMemo(() => {
    const map = new Map();
    visibleRecords.forEach((record) => {
      const code = String(record.cdunidadegestora ?? "").trim() || "Sem código";
      const name =
        String(record.nmunidadegestora ?? "").trim() ||
        "Unidade gestora não informada";
      const key = `${code}||${name}`;
      const group = map.get(key) ?? { key, code, name, records: [] };
      group.records.push(record);
      map.set(key, group);
    });
    return [...map.values()].sort((a, b) =>
      `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, "pt-BR"),
    );
  }, [visibleRecords]);
  const changeOrg = (value) => {
    setSelectedOrg(value);
    setYears([]);
    setSelectedUnits([]);
    setSearch("");
    setSearchQuery("");
    setPage(1);
  };
  const toggleYear = (year) => {
    setYears((current) =>
      current.includes(year)
        ? current.filter((item) => item !== year)
        : [...current, year].sort(),
    );
    setSelectedUnits([]);
    setSearch("");
    setSearchQuery("");
    setPage(1);
  };
  const toggleUnit = (unit) => {
    setSelectedUnits((current) =>
      current.includes(unit.id)
        ? current.filter((item) => item !== unit.id)
        : [...current, unit.id],
    );
    setPage(1);
  };
  const applySearch = () => {
    setSearchQuery(search);
    setPage(1);
  };
  const clearSearch = () => {
    setSearch("");
    setSearchQuery("");
    setPage(1);
  };
  return (
    <section className="notes-shell">
      <header className="notes-header">
        <div>
          <span className="eyebrow">Despesas públicas · 2022–2026</span>
          <h1>Notas de empenho organizadas</h1>
          <p>
            Pesquise palavras-chave no histórico, credor, contrato e demais
            campos. As notas são exibidas por Unidade Gestora, sempre com as 33
            colunas.
          </p>
        </div>
      </header>
      <section className="global-context enhanced-context">
        <div className="context-field">
          <label htmlFor="orgao-empenho">
            <Building2 size={16} /> Órgão
          </label>
          <select
            id="orgao-empenho"
            value={selectedOrg}
            onChange={(event) => changeOrg(event.target.value)}
            disabled={!manifest}
          >
            <option value="all">
              Todos os órgãos (
              {(manifest?.totalRecords ?? 0).toLocaleString("pt-BR")})
            </option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.code} — {organization.name} (
                {organization.total.toLocaleString("pt-BR")})
              </option>
            ))}
          </select>
        </div>
        <form
          className="context-field search-control"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch();
          }}
        >
          <label htmlFor="busca-empenho">
            <Search size={16} /> Buscar nas notas
          </label>
          <div>
            <input
              id="busca-empenho"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ex.: ar-condicionado, extintor..."
              disabled={!scopeOrg || !years.length}
            />
            <button
              className="search-action"
              type="submit"
              disabled={!scopeOrg || !years.length || !search.trim()}
              aria-label="Pesquisar"
            >
              <Search size={18} />
              <span>Pesquisar</span>
            </button>
          </div>
          {searchQuery && (
            <button
              className="clear-search"
              type="button"
              onClick={clearSearch}
            >
              Limpar busca
            </button>
          )}
        </form>
        <fieldset className="context-years" disabled={!scopeOrg}>
          <legend>
            <CalendarDays size={16} /> Ano
          </legend>
          <div>
            {availableYears.map((entry) => (
              <label key={entry.year}>
                <input
                  type="checkbox"
                  checked={years.includes(entry.year)}
                  onChange={() => toggleYear(entry.year)}
                />
                {entry.year}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="context-field unit-filter">
          <label htmlFor="unidade-gestora">
            <Warehouse size={16} /> Unidade gestora
          </label>
          <select
            id="unidade-gestora"
            value=""
            onChange={(event) => {
              const unit = availableUnits.find(
                (item) => item.id === event.target.value,
              );
              if (unit) toggleUnit(unit);
              event.target.value = "";
            }}
            disabled={!availableUnits.length}
          >
            <option value="">
              {selectedUnits.length
                ? `${selectedUnits.length} unidade(s) selecionada(s)`
                : "Todas as unidades gestoras"}
            </option>
            {availableUnits
              .filter((unit) => !selectedUnits.includes(unit.id))
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code} — {unit.name} (
                  {unit.count.toLocaleString("pt-BR")})
                </option>
              ))}
          </select>
          {selectedUnits.length > 0 && (
            <div className="selected-units">
              {availableUnits
                .filter((unit) => selectedUnits.includes(unit.id))
                .map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => toggleUnit(unit)}
                  >
                    {unit.code} ×
                  </button>
                ))}
            </div>
          )}
        </div>
      </section>
      <section className="notes-overview">
        <div>
          <span>Órgão selecionado</span>
          <strong>{scopeOrg?.name ?? "Todos os órgãos"}</strong>
        </div>
        <div>
          <span>Registros encontrados</span>
          <strong>
            {loading && fullMode
              ? "Buscando..."
              : `${resultCount.toLocaleString("pt-BR")} notas`}
          </strong>
        </div>
        <div>
          <span>Colunas por nota</span>
          <strong>{(fields.length || 33) + 1} campos</strong>
        </div>
        <div>
          <span>Valor total das notas</span>
          <strong>{loading && fullMode ? "Calculando..." : formatCurrency(totalNotesValue)}</strong>
        </div>
      </section>
      {error ? (
        <section className="empty-records">
          <Database size={28} />
          <h2>Não foi possível carregar os registros</h2>
          <p>{error}</p>
        </section>
      ) : !scopeOrg || !years.length ? (
        <section className="empty-records">
          <Building2 size={28} />
          <h2>Escolha um órgão e pelo menos um ano</h2>
          <p>
            Selecione um órgão específico ou Todos os órgãos e, em seguida,
            escolha pelo menos um ano.
          </p>
        </section>
      ) : (
        <>
          <section className="agency-group">
            <div className="agency-heading">
              <div>
                <span className="eyebrow">
                  PÁGINA {page} DE {totalPages}
                </span>
                <h2>
                  {scopeOrg.code} — {scopeOrg.name}
                </h2>
              </div>
              <span>
                {loading
                  ? "Carregando..."
                  : `${visibleRecords.length} notas nesta página`}
              </span>
            </div>
            {!loading && !visibleRecords.length ? (
              <section className="empty-records">
                <Search size={28} />
                <h2>Nenhuma nota encontrada</h2>
                <p>Tente outra palavra-chave, Unidade Gestora ou período.</p>
              </section>
            ) : (
              recordsByUnit.map((group) => (
                <section className="unit-group" key={group.key}>
                  <div className="unit-heading">
                    <Warehouse size={18} />
                    <div>
                      <span>UNIDADE GESTORA</span>
                      <h3>
                        {group.code} — {group.name}
                      </h3>
                    </div>
                    <strong>{group.records.length} nota(s) nesta página</strong>
                  </div>
                  <div className="note-grid">
                    {group.records.map((record, index) => (
                      <article
                        className="commitment-card"
                        key={`${record.nunotaempenho}-${record.dtlancamento}-${index}`}
                      >
                        <header>
                          <div>
                            <span>NOTA DE EMPENHO</span>
                            <h3>
                              {formatValue(
                                record.nunotaempenho,
                                "nunotaempenho",
                              )}
                            </h3>
                            <p>
                              {formatValue(
                                record.nmtipoempenho,
                                "nmtipoempenho",
                              )}{" "}
                              ·{" "}
                              {formatValue(record.dtlancamento, "dtlancamento")}
                            </p>
                          </div>
                          <strong>
                            {formatValue(record.vlempenho, "vlempenho")}
                          </strong>
                        </header>
                        {[...new Set(fields.map((field) => field.section))].map(
                          (section) => {
                            const sectionFields = fields.filter(
                              (field) => field.section === section,
                            );
                            return (
                              <section
                                className={`field-section ${section === "Histórico" ? "history" : ""}`}
                                key={section}
                              >
                                <h4>{section}</h4>
                                {section === "Histórico" ? (
                                  <p>
                                    {formatValue(
                                      record.dehistoricoempenho,
                                      "dehistoricoempenho",
                                    )}
                                  </p>
                                ) : (
                                  <dl>
                                    {section === "Classificação orçamentária" && (
                                      <div>
                                        <dt>Elemento</dt>
                                        <dd>{elementFromSubelement(record.cdsubelemento)}</dd>
                                      </div>
                                    )}
                                    {sectionFields.map((field) => (
                                      <div key={field.key}>
                                        <dt>{field.label}</dt>
                                        <dd>
                                          {formatValue(
                                            record[field.key],
                                            field.key,
                                          )}
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                )}
                              </section>
                            );
                          },
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              ))
            )}
          </section>
          {!loading && resultCount > 0 && (
            <nav className="pager" aria-label="Paginação das notas">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Anterior
              </button>
              <span>
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page === totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Próxima
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
