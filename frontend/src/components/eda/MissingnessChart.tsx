import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt, Note, pct } from './Shared';
interface Props { data: { name: string; count: number; percentage: number }[]; mode: 'columns' | 'rows' }
export function MissingnessChart({ data, mode }: Props) {
  if (!data.length) return <Note>No hay columnas para representar.</Note>;
  const columns = mode === 'columns';
  return <div className="category-chart" style={{ height: Math.max(260, data.length * 36) }} role="img" aria-label={columns ? 'Porcentaje de ausencias por columna, eje de 0 a 100 por ciento' : 'Distribución de filas por porcentaje de ausencias'}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={data} margin={{ left: 8, right: 28 }}><CartesianGrid horizontal={false} strokeDasharray="3 3"/><XAxis type="number" domain={columns ? [0, 100] : [0, 'auto']} ticks={columns ? [0, 20, 40, 60, 80, 100] : undefined} allowDataOverflow={columns} allowDecimals={columns} tickFormatter={columns ? v => `${v} %` : fmt}/><YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 11 }} tickFormatter={value => String(value).length > 22 ? `${String(value).slice(0, 22)}…` : String(value)}/><Tooltip content={({ active, payload }) => {
    const row = payload?.[0]?.payload as Props['data'][number] | undefined;
    if (!active || !row) return null;
    return <div className="missing-tooltip"><strong>{row.name}</strong><p>{columns ? 'Celdas ausentes' : 'Filas'}: {fmt(row.count)}</p><p>{columns ? 'Porcentaje de ausencias' : 'Porcentaje del dataset'}: {String(row.percentage).replace('.', ',')} %</p></div>;
  }}/><Bar dataKey={columns ? 'percentage' : 'count'} fill="#33866b" name={columns ? '% ausente' : 'Filas'}/></BarChart></ResponsiveContainer></div>;
}
export function MissingPercent({ value }: { value: number | null }) { return <span title={value === null ? 'Sin denominador válido' : `${String(value).replace('.', ',')} %`}>{value === null ? '—' : pct(value)}</span>; }
