import type { EvaluationMethod } from '../../lib/generalization';
import { Note } from '../eda/Shared';

export function EvaluationMethodSelector({ value, onChange }: { value: EvaluationMethod; onChange: (value: EvaluationMethod) => void }) {
  return <>
    <div className="eda-controls"><label className="eda-field">Evaluación<select value={value} onChange={event => onChange(event.target.value as EvaluationMethod)}>
      <option value="cv">Validación cruzada sobre train (recomendado)</option>
      <option value="simple">Train/test simple (rápido)</option>
    </select></label></div>
    <Note>CV: tres folds solo sobre train, con métricas por fold y diagnóstico de generalización. Test queda reservado hasta que confirmes su evaluación final. Train/test simple: un ajuste y evaluación directa en test, más rápido. Ambos métodos mantienen los límites del backend.</Note>
  </>;
}
