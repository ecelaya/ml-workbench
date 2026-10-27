import { useMemo, useState } from 'react';
import type { Dataset } from '../../types/dataset';
import { filteredCsv, rowMissingness, rowsAboveThreshold } from '../../lib/missingness';
import { percent } from '../../lib/eda';
import { fmt, MultiSelect, Note, Panel, pct, Table } from './Shared';
import { MissingnessChart, MissingPercent } from './MissingnessChart';

export function RowMissingness({ dataset }: { dataset: Dataset }) {
  const [selected, setSelected] = useState(() => dataset.headers.map((_, i) => i));
  const [threshold, setThreshold] = useState(40);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const report = useMemo(() => rowMissingness(dataset.rows, dataset.headers.length, selected), [dataset.rows, dataset.headers.length, selected]);
  const filtered = useMemo(() => rowsAboveThreshold(report.records, report.columns.length, threshold), [report.records, report.columns.length, threshold]);
  const pageSize = 20, pages = Math.max(1, Math.ceil(filtered.length / pageSize)), current = Math.min(page, pages - 1);
  function exportRows() {
    setError('');
    try {
      const csv = filteredCsv(dataset.headers, dataset.rows, filtered, dataset.delimiter || ',');
      const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${dataset.name.replace(/\.csv$/i, '')}-ausencias-mayores-${threshold}.csv`;
      document.body.appendChild(anchor);
      try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch { setError('No se pudo generar la descarga. Intenta seleccionar menos filas o vuelve a intentarlo.'); }
  }
  return <Panel title="Valores ausentes por fila" detail="Calculado sobre todos los registros procesados, con independencia de su rol estadístico."><MultiSelect dataset={dataset} selected={report.columns} label="Columnas consideradas para las ausencias por fila" onChange={indices => { setSelected(indices); setPage(0); setError(''); }}/><Note>Columnas consideradas: <strong>{report.columns.length} de {dataset.headers.length}</strong>. NA por fila = celdas ausentes en la selección / columnas consideradas × 100. «NA», «NULL» y «N/A» son texto, no ausentes.</Note>
    {!report.columns.length ? <Note>Selecciona al menos una columna. Los porcentajes y el filtro no se calculan con un denominador cero.</Note> : <><Table headers={['Registros procesados', 'Media de NA por fila', 'Mediana de NA por fila', 'Máximo observado', 'Filas vacías (todas las columnas)', 'Filas con 100 % NA en la selección']} rows={[[fmt(dataset.rows.length), <MissingPercent value={report.mean}/>, <MissingPercent value={report.median}/>, <MissingPercent value={report.max}/>, fmt(report.completelyEmpty), fmt(report.emptyInSelection)]]}/><Note>«Filas vacías» revisa todas las columnas originales; «100 % NA en la selección» solo las columnas consideradas. El lector CSV omite líneas completamente vacías; el diagnóstico se refiere a los registros procesados.</Note>
    {!dataset.rows.length ? <Note>No hay registros procesados: media, mediana y máximo no están definidos.</Note> : <><MissingnessChart data={report.distribution.map(band => ({ ...band }))} mode="rows"/><Table headers={['NA por fila (intervalos excluyentes)', 'Número de filas', '% del total de registros']} rows={report.distribution.map(band => [band.name, fmt(band.count), <MissingPercent value={band.percentage}/>])}/></>}
    <div className="row-missing-controls"><label htmlFor="row-na-threshold">Umbral de ausencias: <strong>{threshold} %</strong></label><input id="row-na-threshold" type="range" min="0" max="100" step="1" value={threshold} aria-valuetext={`${threshold} por ciento`} onChange={e => { setThreshold(Number(e.target.value)); setPage(0); setError(''); }}/><div className="range-ends"><span>0 %</span><span>100 %</span></div><p role="status" aria-live="polite"><strong>{fmt(filtered.length)}</strong> filas superan estrictamente {threshold} %: <strong>{pct(percent(filtered.length, dataset.rows.length))}</strong> del dataset.</p><button className="eda-action" disabled={!filtered.length} onClick={exportRows}>Descargar {fmt(filtered.length)} filas como CSV</button></div>{error && <div className="error" role="alert">{error}</div>}
    <Note>El filtro usa valores sin redondear y la condición estricta «mayor que». La descarga incluye todas las filas filtradas, todas las columnas originales y sus valores, sin añadir métricas ni números de fila. No se modifica el dataset.</Note>
    {!filtered.length ? <Note>Ninguna fila supera el umbral seleccionado.</Note> : <><div className="table-scroll" tabIndex={0} role="region" aria-label="Filas con ausencias superiores al umbral"><table><thead><tr><th scope="col">Registro original</th><th scope="col">Celdas ausentes (selección)</th><th scope="col">% NA (selección)</th>{dataset.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{filtered.slice(current * pageSize, (current + 1) * pageSize).map(record => <tr key={record.index}><td>{record.index + 1}</td><td>{record.missing}</td><td><MissingPercent value={record.percentage}/></td>{dataset.headers.map((header, i) => <td key={header} title={dataset.rows[record.index]?.[i] ?? ''}>{dataset.rows[record.index]?.[i]}</td>)}</tr>)}</tbody></table></div><div className="pagination"><span>{current * pageSize + 1}–{Math.min((current + 1) * pageSize, filtered.length)} de {fmt(filtered.length)} · Página {current + 1} de {pages}</span><div><button aria-label="Página anterior de filas filtradas" disabled={current === 0} onClick={() => setPage(current - 1)}>←</button><button aria-label="Página siguiente de filas filtradas" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>→</button></div></div><Note>«Registro original» es la posición de la fila en el dataset procesado (sin cabecera), no el número de línea física del CSV.</Note></>}
    </>}
  </Panel>;
}
