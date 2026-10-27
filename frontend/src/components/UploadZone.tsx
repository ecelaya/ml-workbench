import { useRef, useState } from 'react';
interface Props { busy: boolean; progress: number; onFile: (file: File) => void; examplesOpen: boolean; onToggleExamples: () => void }
export function UploadZone({ busy, progress, onFile, examplesOpen, onToggleExamples }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <section className={`upload-zone ${dragging ? 'dragging' : ''}`} aria-label="Cargar dataset" onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file && !busy) onFile(file); }}>
    <span className="upload-icon" aria-hidden="true">↥</span><div><h3>{busy ? 'Analizando tu dataset…' : 'Tu próximo descubrimiento empieza aquí'}</h3><p>{busy ? `${progress.toLocaleString('es-ES')} filas leídas` : 'Arrastra un CSV o selecciona un archivo para empezar a explorar.'}</p></div>
    <button className="primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Procesando…' : '↑  Seleccionar CSV'}</button>
    <input ref={input} className="sr-only" type="file" accept=".csv,text/csv" disabled={busy} aria-label="Seleccionar archivo CSV" onChange={e => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = ''; }} />
    <small>CSV · UTF-8 · Hasta 10 MB · 100.000 filas · 200 columnas</small>
    <button className="sample-toggle" aria-expanded={examplesOpen} aria-controls="sample-catalog" onClick={onToggleExamples}>{examplesOpen ? 'Ocultar datasets de ejemplo' : 'Explorar dataset de ejemplo'} <span aria-hidden="true">{examplesOpen ? '−' : '+'}</span></button>
  </section>;
}
