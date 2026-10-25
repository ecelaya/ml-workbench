import { useState } from 'react';
import type { Dataset, StatisticalRole } from '../types/dataset';
import { Variables } from './eda/Variables';
import { Univariate, type Orders } from './eda/Univariate';
import { Bivariate } from './eda/Bivariate';
import { Quality } from './eda/Quality';
import { Note } from './eda/Shared';
const tabs = [{ id: 'variables', label: 'Variables' }, { id: 'univariate', label: 'Univariante' }, { id: 'bivariate', label: 'Bivariante' }, { id: 'quality', label: 'Calidad de datos' }] as const;
interface Props { dataset: Dataset; onRole: (index: number, role: StatisticalRole) => void; active: boolean }
export function Exploratory({ dataset, onRole, active }: Props) {
  const [tab, setTab] = useState<typeof tabs[number]['id']>('variables');
  const [selected, setSelected] = useState(() => dataset.columns.flatMap((c, i) => c.role !== 'Identificador' ? [i] : []).slice(0, 5));
  const [variable, setVariable] = useState(() => dataset.columns.findIndex(c => c.role !== 'Identificador'));
  const [matrix, setMatrix] = useState(() => dataset.columns.flatMap((c, i) => c.role === 'Numérica' ? [i] : []).slice(0, 8));
  const [x, setX] = useState(0), [y, setY] = useState(1);
  const [orders, setOrders] = useState<Orders>({});
  if (!active) return null;
  if (!dataset.columns.length) return <Note>No hay variables disponibles para explorar.</Note>;
  const graphVariable = dataset.columns[variable] ? variable : 0;
  return <><div className="tabs eda-subtabs" role="tablist" aria-label="Secciones del análisis exploratorio">{tabs.map(t => <button key={t.id} id={`eda-${t.id}-tab`} role="tab" aria-selected={tab === t.id} aria-controls="eda-panel" className={tab === t.id ? 'selected' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}</div><div id="eda-panel" role="tabpanel" aria-labelledby={`eda-${tab}-tab`}>{tab === 'variables' ? <Variables dataset={dataset} onRole={(index, role) => { setMatrix(old => old.filter(i => i !== index)); onRole(index, role); }}/> : tab === 'univariate' ? <Univariate dataset={dataset} selected={selected} onSelected={setSelected} variable={graphVariable} onVariable={setVariable} orders={orders} onOrder={(i, order) => setOrders(old => ({ ...old, [i]: order }))}/> : tab === 'bivariate' ? <Bivariate dataset={dataset} selected={matrix} onSelected={setMatrix} x={x} y={y} onX={setX} onY={setY} orders={orders}/> : <Quality dataset={dataset}/>}</div></>;
}
