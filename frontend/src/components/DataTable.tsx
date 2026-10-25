import { useState } from 'react';
import type { Dataset } from '../types/dataset';
import { isMissing } from '../lib/csv';
export function DataTable({ dataset }: { dataset: Dataset }) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const pages = Math.ceil(dataset.rows.length / size);
  return <section className="panel"><div className="panel-heading"><div><h2>Vista de datos <span className="badge">CSV</span></h2><p>Explora los registros de tu archivo original.</p></div><label className="page-size">Filas <select value={size} onChange={e => { setSize(Number(e.target.value)); setPage(0); }}>{[10, 25, 50].map(n => <option key={n}>{n}</option>)}</select></label></div>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Registros del dataset"><table><thead><tr><th scope="col">#</th>{dataset.headers.map((h, i) => <th scope="col" key={h}><span>{h}</span><small>{dataset.columns[i]?.type}</small></th>)}</tr></thead><tbody>{dataset.rows.slice(page * size, (page + 1) * size).map((row, i) => <tr key={page * size + i}><td className="row-number">{page * size + i + 1}</td>{row.map((value, j) => <td key={j} title={value}>{isMissing(value) ? <span className="missing">Vacío</span> : value}</td>)}</tr>)}</tbody></table></div>
    <div className="pagination"><span>{page * size + 1}–{Math.min((page + 1) * size, dataset.rows.length)} de {dataset.rows.length.toLocaleString('es-ES')} registros</span><div><button aria-label="Página anterior" disabled={page === 0} onClick={() => setPage(p => p - 1)}>←</button><span>Página {page + 1} de {pages}</span><button aria-label="Página siguiente" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>→</button></div></div>
  </section>;
}
