import type { ModelId, Task } from '../../types/experiment';
import { MODELS } from '../../lib/experiments';
import { METRIC_INFO } from '../../lib/modelResults';
import { Note, Panel } from '../eda/Shared';
export function ComparisonOptions({ task, models, onModels, metrics, primary, onPrimary }: { task: Task; models: ModelId[]; onModels: (models: ModelId[]) => void; metrics: string[]; primary: string; onPrimary: (metric: string) => void }) {
  return <Panel title="4. Candidatos y validación cruzada" detail="Selecciona entre dos y tres algoritmos. No hay búsqueda de hiperparámetros.">
    <fieldset className="eda-multiselect"><legend>Modelos candidatos</legend><div className="eda-choices">{MODELS.filter(m => m.task === task).map(m => <label key={m.id}><input type="checkbox" checked={models.includes(m.id)} onChange={e => onModels(e.target.checked ? [...models, m.id] : models.filter(id => id !== m.id))}/>{m.name}</label>)}</div></fieldset>
    <div className="eda-controls"><label className="eda-field">Métrica principal<select value={primary} onChange={e => onPrimary(e.target.value)}>{metrics.map(metric => <option key={metric} value={metric}>{METRIC_INFO[metric]?.label ?? metric}</option>)}</select></label><label className="eda-field">Folds<select value="3" disabled><option value="3">3 folds</option></select></label></div>
    <Note>Clasificación: StratifiedKFold si cada clase de train tiene al menos tres registros; de lo contrario se rechaza. Regresión: KFold. Shuffle activado y misma semilla e índices para todos los candidatos. Cada fold ajusta su propio Pipeline. Test permanece reservado.</Note>
    <Note>Modelos y folds se ejecutan secuencialmente dentro del presupuesto global del backend (60 segundos por defecto, incluido el arranque). Random Forest puede agotar ese plazo. Cinco folds permanecen deshabilitados por recursos.</Note>
  </Panel>;
}
