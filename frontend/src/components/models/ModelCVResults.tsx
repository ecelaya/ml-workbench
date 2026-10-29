import type { ComparisonResult } from '../../types/comparison';
import { Note, Panel } from '../eda/Shared';
import { Generalization } from './Generalization';
export function ModelCVResults({ result, busy, attempted, onEvaluate, targetUnits }: { result: ComparisonResult; busy: boolean; attempted: boolean; onEvaluate: () => void; targetUnits?: string }) {
  return <><Generalization cv={result} targetUnits={targetUnits}/><Panel title="CV sobre train completada" detail={`${result.splitter}, shuffle, semilla ${result.seed}; ${result.sizes.train} registros para CV, ${result.sizes.test} reservados para test.`}>
    <Note>Duración global: {result.duration_seconds.toFixed(2)} s. Cada fold ajustó un Pipeline nuevo, sin utilizar test. Sesión válida hasta {new Date(result.expires_at * 1000).toLocaleTimeString('es-ES')}.</Note>
    {result.warnings.map((warning, i) => <Note key={i}>{warning}</Note>)}
    {result.models[0]?.folds.map(f => f.warnings.length > 0 && <Note key={f.fold}>Fold {f.fold}: {f.warnings.join(' · ')}</Note>)}
    <div className="eda-controls"><button className="primary" disabled={busy || attempted} onClick={onEvaluate}>Reajustar con todo train y evaluar una vez en test</button></div>
    <Note>Opcional: esta confirmación consume el intento de evaluación, también si falla o agota el tiempo. No se cambia el modelo automáticamente según test.</Note>
  </Panel></>;
}
