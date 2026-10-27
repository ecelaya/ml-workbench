import type { SampleDataset } from '../data/sampleDatasets';
import { sampleDatasetUrl } from '../data/sampleDatasets';
import type { Dataset } from '../types/dataset';
import { MAX_BYTES } from './csv';

// Fetch only the bundled asset on this app's host. Analysis still runs locally.
export async function sampleDatasetFile(sample: SampleDataset, baseUrl: string, fetcher: typeof fetch = fetch): Promise<File> {
  const response = await fetcher(sampleDatasetUrl(sample, baseUrl));
  if (!response.ok) throw new Error(`No se pudo descargar ${sample.name} (HTTP ${response.status}). Vuelve a intentarlo.`);
  if (response.headers.get('content-type')?.includes('text/html')) throw new Error(`No se encontró el CSV de ${sample.name}.`);
  const blob = await response.blob();
  if (blob.size > MAX_BYTES || blob.size !== sample.bytes) throw new Error(`El archivo de ${sample.name} no coincide con la versión del catálogo.`);
  return new File([blob], sample.filename, { type: 'text/csv' });
}
export function validateSampleDataset(dataset: Dataset, sample: SampleDataset): void {
  if (dataset.rows.length !== sample.rows || dataset.headers.length !== sample.columns || !dataset.headers.includes(sample.target)) {
    throw new Error(`Los datos de ${sample.name} no coinciden con su catálogo. No se han cargado resultados parciales.`);
  }
}
