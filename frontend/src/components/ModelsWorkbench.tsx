import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset, StatisticalRole } from '../types/dataset';
import type { ExperimentConfig, ExperimentResult, Task } from '../types/experiment';
import { activePredictors, defaultModel, defaultPredictors, MODELS, runExperiment, suggestTask, targetSummary, validateExperiment } from '../lib/experiments';
import { inferTargetUnits } from '../lib/modelResults';
import { ProblemStep } from './models/ProblemStep';
import { PreprocessingStep } from './models/PreprocessingStep';
import { ExperimentResults } from './models/ExperimentResults';
import { Note, Panel } from './eda/Shared';
import { SummaryCards } from './models/SummaryCards';
interface Props { dataset: Dataset | null; active: boolean; suggestedTarget?: string; suggestedTask?: Task; suggestedTargetUnits?: string; excludedPredictors?: readonly string[]; onRole: (index: number, role: StatisticalRole) => void; onExplore: () => void }
export function ModelsWorkbench({ dataset, active, suggestedTarget, suggestedTask, suggestedTargetUnits, excludedPredictors, onRole, onExplore }: Props) {
  const initialTarget = suggestedTarget ?? dataset?.columns.filter(c => c.role !== 'Identificador').at(-1)?.name ?? '';
  const [target, setTarget] = useState(initialTarget);
  const [positiveClass, setPositiveClass] = useState('');
  const [targetUnits, setTargetUnits] = useState(suggestedTargetUnits ?? inferTargetUnits(initialTarget));
  const [task, setTask] = useState<Task>(suggestedTask ?? suggestTask(dataset?.columns.find(c => c.name === initialTarget)?.role));
  const [predictors, setPredictors] = useState(() => dataset ? defaultPredictors(dataset, initialTarget, excludedPredictors) : []);
  const [explicitIdentifiers, setExplicitIdentifiers] = useState<string[]>([]);
  const [testSize, setTestSize] = useState(.2), [seed, setSeed] = useState(42), [stratify, setStratify] = useState(true);
  const [preprocessing, setPreprocessing] = useState<ExperimentConfig['preprocessing']>({ numeric_imputation: 'median', scaling: 'standard', categorical_imputation: 'most_frequent' });
  const [model, setModel] = useState(() => defaultModel(suggestedTask ?? suggestTask(dataset?.columns.find(c => c.name === initialTarget)?.role)));
  const [step, setStep] = useState(0), [training, setTraining] = useState(false);
  const [error, setError] = useState(''), [result, setResult] = useState<ExperimentResult | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!result || !active) return;
    resultsRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [result, active]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setTraining(false);
    setResult(null);
    setPredictors(old => old.filter(name => dataset?.columns.find(c => c.name === name)?.role !== 'Identificador' || explicitIdentifiers.includes(name)));
  }, [dataset?.columns, explicitIdentifiers]);
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '';
  const config = useMemo<ExperimentConfig>(() => ({ target, predictors: predictors.filter(name => name !== target), roles: Object.fromEntries(dataset?.columns.map(c => [c.name, c.role]) ?? []), task, model, test_size: testSize, seed, stratify, preprocessing, positive_class: task === 'classification' ? positiveClass || undefined : undefined, target_units: task === 'regression' ? targetUnits.trim() || undefined : undefined }), [dataset?.columns, target, predictors, task, model, testSize, seed, stratify, preprocessing, positiveClass, targetUnits]);
  const summary = dataset ? targetSummary(dataset, target, testSize, task) : null;
  const errors = dataset ? validateExperiment(dataset, config) : [];
  if (task === 'classification' && summary?.counts.size === 2 && !positiveClass) errors.push('Elige explícitamente la clase positiva del problema binario.');
  function chooseTask(value: Task) { setTask(value); setPositiveClass(''); setModel(defaultModel(value)); setResult(null); setError(''); }
  function chooseTarget(value: string) {
    setTarget(value); chooseTask(suggestTask(dataset?.columns.find(c => c.name === value)?.role));
    setTargetUnits(value === suggestedTarget ? suggestedTargetUnits ?? inferTargetUnits(value) : inferTargetUnits(value));
    setExplicitIdentifiers([]);
    setPredictors(dataset ? defaultPredictors(dataset, value, value === suggestedTarget ? excludedPredictors : []) : []);
  }
  function choosePredictors(values: string[]) {
    setExplicitIdentifiers(values.filter(name => dataset?.columns.find(c => c.name === name)?.role === 'Identificador'));
    setPredictors(values);
  }
  async function train() {
    if (!dataset || training || !apiUrl || errors.length) return;
    const controller = new AbortController(); request.current = controller;
    setTraining(true); setError(''); setResult(null);
    try {
      const response = await runExperiment(apiUrl, dataset, config, controller.signal);
      if (request.current === controller && !controller.signal.aborted) setResult(response);
    }
    catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'El entrenamiento falló.'); }
    finally { if (request.current === controller) { request.current = null; setTraining(false); } }
  }
  if (!active) return null;
  if (!dataset || !summary) return <Panel title="Modelos supervisados"><Note>Carga primero un CSV o un dataset de ejemplo para configurar un experimento.</Note><div className="eda-controls"><button className="eda-action" onClick={onExplore}>Ir a explorar datos</button></div></Panel>;
  const steps = ['Problema', 'Train / test', 'Preprocesamiento', 'Entrenamiento'];
  return <div className="models-workbench eda-stack"><div className="model-intro"><div><h2>De la exploración al primer modelo</h2><p>{dataset.name} · {dataset.rows.length.toLocaleString('es-ES')} registros completos disponibles.</p></div><span className="badge">ML GUIADO</span></div>{!apiUrl && <div className="model-notice" role="status">Backend sin configurar. Define VITE_API_URL en frontend/.env.local y reinicia Vite para entrenar. Puedes preparar el experimento y seguir usando el EDA.</div>}
    <nav className="model-steps" aria-label="Pasos del experimento">{steps.map((label, i) => <button key={label} aria-current={step === i ? 'step' : undefined} className={step === i ? 'selected' : ''} disabled={training} onClick={() => { setStep(i); setResult(null); setError(''); }}><span>{i + 1}</span>{label}</button>)}</nav>
    <fieldset className="model-config" disabled={training} onChange={() => { setResult(null); setError(''); }}>
      {step === 0 ? <ProblemStep dataset={dataset} target={target} task={task} predictors={config.predictors} onTarget={chooseTarget} onTask={chooseTask} positiveClass={positiveClass} onPositiveClass={setPositiveClass} targetUnits={targetUnits} onTargetUnits={setTargetUnits} onPredictors={choosePredictors} suggestedTarget={suggestedTarget} onRole={(i, role) => { onRole(i, role); if (dataset.headers[i] === target) chooseTask(suggestTask(role)); }}/> : step === 1 ? <Panel title="2. Separar entrenamiento y test" detail="El mismo split se utiliza para ajustar y evaluar este experimento, sin reintentos para mejorar métricas."><div className="eda-controls"><label className="eda-field">Porcentaje de test: {Math.round(testSize * 100)} %<input type="range" min="10" max="40" step="1" value={Math.round(testSize * 100)} onChange={e => setTestSize(Number(e.target.value) / 100)}/></label><label className="eda-field">Semilla aleatoria<input type="number" min="0" max="4294967295" step="1" value={Number.isNaN(seed) ? '' : seed} onChange={e => setSeed(e.target.value === '' ? NaN : Number(e.target.value))}/></label><label className="model-check"><input type="checkbox" checked={stratify} disabled={task !== 'classification'} onChange={e => setStratify(e.target.checked)}/>Estratificar clasificación cuando sea viable</label></div><SummaryCards items={[{ label: 'Recibidas', value: dataset.rows.length }, { label: 'Excluidas por target', value: summary.excluded.length }, { label: 'Utilizables', value: summary.usable }, { label: 'Train previsto', value: summary.train }, { label: 'Test previsto', value: summary.test }]}/><Note>{task === 'regression' ? 'La regresión utiliza split aleatorio sin estratificación.' : stratify && !summary.stratifiable ? 'No es viable estratificar con esta representación de clases y tamaño de split. La API usará split aleatorio y lo indicará; si train pierde clases suficientes rechazará la ejecución.' : stratify ? 'Se prevé split estratificado para conservar proporciones de clases.' : 'Estratificación desactivada: se usará split aleatorio.'} La API volverá a validar los tamaños con el dataset completo.</Note></Panel> : step === 2 ? <PreprocessingStep dataset={dataset} predictors={config.predictors} value={preprocessing} onChange={setPreprocessing}/> : <Panel title="4. Entrenar y evaluar" detail="Al pulsar Entrenar se envían el CSV completo y esta configuración a FastAPI."><div className="eda-controls"><label className="eda-field">Modelo<select value={model} onChange={e => setModel(e.target.value as ExperimentConfig['model'])}>{MODELS.filter(m => m.task === task).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label></div><SummaryCards items={[{ label: 'Objetivo', value: target }, { label: 'Problema', value: task === 'classification' ? summary.counts.size === 2 ? 'Clasificación binaria' : 'Clasificación multiclase' : 'Regresión' }, { label: 'Predictores utilizados', value: activePredictors(config).length }, { label: 'Train', value: summary.train }, { label: 'Test', value: summary.test }, { label: 'Semilla', value: Number.isNaN(seed) ? '—' : seed }]}/><Note>Los límites de iteraciones, árboles, profundidad y hojas se aplican en el servidor. Los parámetros ejecutados figuran en los resultados. No se seleccionan hiperparámetros usando test.</Note><Note>Solo se transmiten datos cuando solicitas entrenar. El backend no guarda archivos, modelos ni experimentos permanentemente. El entrenamiento puede tardar; los indicadores no estiman un porcentaje ficticio.</Note>{suggestedTarget === target && excludedPredictors?.length ? <Note>Exclusiones sugeridas del ejemplo: {excludedPredictors.join(', ')} (información posterior al objetivo). Puedes revisar los predictores en el paso 1.</Note> : null}</Panel>}
    </fieldset>
    {errors.length > 0 && <div className="model-notice" role="status">{errors.map(message => <p key={message}>{message}</p>)}</div>}
    <div className="model-navigation"><button className="eda-action" disabled={step === 0 || training} onClick={() => { setStep(s => s - 1); setResult(null); setError(''); }}>Anterior</button>{step < 3 ? <button className="primary" disabled={training || errors.length > 0} onClick={() => setStep(s => s + 1)}>Siguiente →</button> : <button className="primary" disabled={training || errors.length > 0 || !apiUrl} onClick={() => void train()}>{training ? 'Entrenando…' : 'Entrenar y evaluar en test'}</button>}</div>
    {training && <div className="model-notice" role="status" aria-live="polite">Entrenamiento en curso: enviando el dataset completo, ajustando el pipeline con train y evaluando en test…</div>}
    {error && <div className="error" role="alert">{error}</div>}
    {result && <div ref={resultsRef} style={{ scrollMarginTop: 24 }}><ExperimentResults result={result}/></div>}
  </div>;
}
