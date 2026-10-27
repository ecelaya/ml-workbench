import { lazy, Suspense, useRef, useState } from 'react';
import type { Dataset, StatisticalRole } from './types/dataset';
import { parseCsv } from './lib/csv';
import { StatCard } from './components/StatCard';
import { UploadZone } from './components/UploadZone';
import { DataTable } from './components/DataTable';
import { SampleCatalog } from './components/SampleCatalog';
import { sampleDatasetUrl, type SampleDataset } from './data/sampleDatasets';
import { sampleDatasetFile, validateSampleDataset } from './lib/sampleDatasets';
const ModelsWorkbench = lazy(() => import('./components/ModelsWorkbench').then(module => ({ default: module.ModelsWorkbench })));
const Overview = lazy(() => import('./components/Overview').then(module => ({ default: module.Overview })));
const Exploratory = lazy(() => import('./components/Exploratory').then(module => ({ default: module.Exploratory })));
const number = (n: number) => n.toLocaleString('es-ES');
export default function App() {
  const [section, setSection] = useState<'explore' | 'models'>('explore');
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [activeSample, setActiveSample] = useState<SampleDataset | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const loading = useRef(false);
  const [datasetRevision, setDatasetRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [tab, setTab] = useState<'overview' | 'data' | 'analysis'>('overview');
  async function load(source: File | SampleDataset) {
    if (loading.current) return;
    loading.current = true;
    setBusy(true); setError(''); setProgress(0);
    try {
      const sample = source instanceof File ? null : source;
      const file = source instanceof File ? source : await sampleDatasetFile(source, import.meta.env.BASE_URL);
      const result = await parseCsv(file, setProgress, { missingValueTokens: sample?.missingValueTokens });
      if (sample) validateSampleDataset(result, sample);
      setDataset(result); setActiveSample(sample); setDatasetRevision(v => v + 1); setTab('overview'); setSection('explore');
      if (sample) setExamplesOpen(false);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo procesar el CSV.'); }
    finally { loading.current = false; setBusy(false); }
  }
  function changeRole(index: number, role: StatisticalRole) {
    setDataset(old => old ? { ...old, columns: old.columns.map((c, i) => i === index ? { ...c, role } : c) } : old);
  }
  const missingRate = dataset ? dataset.missing / (dataset.rows.length * dataset.headers.length) * 100 : 0;
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="#"><span className="brand-icon">▥</span><span>ML Workbench<small>DATA EXPLORATION STUDIO</small></span></a><div className="workspace"><span className="workspace-avatar">W</span><div>Mi espacio de trabajo<small>Workspace local</small></div><span className="local-dot"/></div><p className="nav-label">WORKSPACE</p><nav aria-label="Navegación principal"><a className={`nav-item ${section === 'explore' ? 'active' : ''}`} href="#explorar" onClick={() => setSection('explore')}><span>◫</span>Explorar datos<span className="nav-arrow">↗</span></a><a className={`nav-item ${section === 'models' ? 'active' : ''}`} href="#modelos" onClick={() => setSection('models')}><span>◇</span>Modelos</a><div className="nav-item unavailable"><span>⇄</span>Comparaciones<small>Próximamente</small></div></nav><div className="sidebar-note"><span>⌘</span><h3>Tus datos, en tu navegador.</h3><p>El EDA se procesa localmente. Solo se envía el dataset a tu backend cuando solicitas entrenar.</p><span className="privacy-tag">● &nbsp; EDA local</span></div><footer className="sidebar-footer"><span className="version">v0.3.0</span> Hecho para explorar</footer></aside>
    <div className="main-shell"><header className="topbar"><span>Workspace <span className="crumb">/</span> <strong>{section === 'models' ? 'Modelos' : 'Explorar datos'}</strong></span><span className="local-status"><span className="local-dot"/> Sesión local</span></header><main id="explorar"><div className="page-heading"><div><div className="eyebrow">DE LOS DATOS A LAS IDEAS</div><h1>Explora. Entiende. Descubre<span>.</span></h1><p>Conoce tus datos antes de dar el siguiente paso.</p></div><span className="release">EXPLORER <b>v0.3.0</b></span></div>
    <div hidden={section !== 'explore'}>
    <UploadZone busy={busy} progress={progress} onFile={file => void load(file)} examplesOpen={examplesOpen} onToggleExamples={() => setExamplesOpen(open => !open)}/>{examplesOpen && <SampleCatalog busy={busy} activeId={activeSample?.id} onSelect={sample => void load(sample)}/>}{error && <div className="error" role="alert"><strong>No se pudo cargar el archivo.</strong> {error}{dataset && ' Se conserva el dataset anterior.'}</div>}
    <div className="section-title"><h2>Resumen del dataset</h2>{dataset ? <span className="file-info" title={dataset.name}>▤ {activeSample?.name ?? dataset.name} <button disabled={busy} onClick={() => { setDataset(null); setActiveSample(null); setError(''); }} aria-label="Eliminar dataset">×</button></span> : <span>Esperando tu primer archivo</span>}</div>
    {dataset && activeSample && <div className="sample-active"><span>Ejemplo activo: <strong>{activeSample.name}</strong> · Objetivo sugerido: <strong>{activeSample.target}</strong></span><a href={sampleDatasetUrl(activeSample, import.meta.env.BASE_URL)} download={activeSample.filename}>Descargar CSV original del ejemplo</a></div>}
    <div className="stats-grid"><StatCard label="Registros" value={dataset ? number(dataset.rows.length) : '—'} detail="Filas de datos, sin cabecera" icon="≡"/><StatCard label="Variables" value={dataset ? number(dataset.headers.length) : '—'} detail="Columnas en tu dataset" icon="▥"/><StatCard label="Valores faltantes" value={dataset ? number(dataset.missing) : '—'} detail={dataset ? `${missingRate.toLocaleString('es-ES', { maximumFractionDigits: 2 })}% de las celdas están vacías` : 'Celdas vacías o con espacios'} icon="◌"/><StatCard label="Tamaño del archivo" value={dataset ? `${(dataset.bytes / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} KB` : '—'} detail="Procesamiento 100% local" icon="▤"/></div>
    {dataset ? <><div className="tabs" role="tablist" aria-label="Vistas del dataset"><button id="overview-tab" role="tab" aria-selected={tab === 'overview'} aria-controls="dataset-panel" className={tab === 'overview' ? 'selected' : ''} onClick={() => setTab('overview')}>◫ &nbsp; Vista general</button><button id="data-tab" role="tab" aria-selected={tab === 'data'} aria-controls="dataset-panel" className={tab === 'data' ? 'selected' : ''} onClick={() => setTab('data')}>▦ &nbsp; Datos</button><button id="analysis-tab" role="tab" aria-selected={tab === 'analysis'} aria-controls="dataset-panel" className={tab === 'analysis' ? 'selected' : ''} onClick={() => setTab('analysis')}>Análisis exploratorio</button></div><div id="dataset-panel" role="tabpanel" aria-labelledby={`${tab}-tab`}>{tab === 'overview' ? <Suspense fallback={<p className="method-note">Cargando vista general…</p>}><Overview dataset={dataset}/></Suspense> : tab === 'data' ? <DataTable key={datasetRevision} dataset={dataset}/> : null}<Suspense fallback={tab === 'analysis' ? <p className="method-note">Cargando análisis…</p> : null}><Exploratory key={datasetRevision} dataset={dataset} onRole={changeRole} active={section === 'explore' && tab === 'analysis'}/></Suspense></div><p className="method-note">Detección orientativa sobre todas las filas: números con punto decimal, booleanos true/false y fechas ISO (AAAA-MM-DD). Los valores originales se conservan. Separador detectado: {dataset.delimiter === '\t' ? 'tabulador' : `«${dataset.delimiter}»`}.</p></> : <section className="empty-state"><div className="empty-visual"><span>▤</span><i>⌕</i></div><span className="eyebrow">UN LIENZO PARA TUS DATOS</span><h2>Todo empieza con un dataset</h2><p>Carga tu primer CSV para visualizar registros, conocer tus variables<br className="desktop-break"/> y descubrir la calidad de tus datos en un solo lugar.</p><div className="empty-steps"><span><b>01</b> Carga tu CSV</span><span className="step-line"/><span><b>02</b> Explora los datos</span><span className="step-line"/><span><b>03</b> Encuentra ideas</span></div></section>}
    </div><div id="modelos"><Suspense fallback={section === 'models' ? <p className="method-note">Cargando modelos…</p> : null}><ModelsWorkbench key={datasetRevision} dataset={dataset} active={section === 'models'} suggestedTarget={activeSample?.target} suggestedTask={activeSample ? activeSample.problem === 'Regresión' ? 'regression' : 'classification' : undefined} excludedPredictors={activeSample?.suggestedExcludedPredictors} onRole={changeRole} onExplore={() => setSection('explore')}/></Suspense></div>
    <footer className="main-footer"><span>ML Workbench <span>·</span> Tu punto de partida para machine learning</span><span>EDA local · Entrenamiento bajo solicitud</span></footer><div className="sr-only" role="status" aria-live="polite">{busy ? 'Procesando archivo' : dataset ? `Dataset cargado con ${dataset.rows.length} registros` : 'Sin dataset'}</div></main></div></div>;
}
