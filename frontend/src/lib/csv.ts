import Papa from 'papaparse';
import type { ColumnProfile, Dataset } from '../types/dataset';
import { inferRole, inferStorage } from './inference';
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 100_000;
export const MAX_COLUMNS = 200;
export const isMissing = (value: string): boolean => value.trim() === '';
export function profile(headers: string[], rows: string[][]): ColumnProfile[] {
  return headers.map((name, i) => {
    const values = rows.map(row => (row[i] ?? '').trim()).filter(v => !isMissing(v));
    const type = inferStorage(values);
    const unique = new Set(values).size;
    const suggestion = inferRole(name, values, type);
    return { name, type, role: suggestion.role, suggestion, missing: rows.length - values.length, unique };
  });
}
export interface CsvParseOptions { missingValueTokens?: readonly string[] }
export function parseCsv(file: File, onProgress?: (rows: number) => void, options: CsvParseOptions = {}): Promise<Dataset> {
  const missingTokens = new Set(options.missingValueTokens ?? []);
  return new Promise((resolve, reject) => {
    if (!/\.csv$/i.test(file.name)) { reject(new Error('Selecciona un archivo con extensión .csv.')); return; }
    if (file.size > MAX_BYTES) { reject(new Error('El archivo supera el límite de 10 MB.')); return; }
    if (!file.size) { reject(new Error('El archivo está vacío.')); return; }
    const rows: string[][] = [];
    let headers: string[] | undefined;
    let failure = '';
    let delimiter = '';
    Papa.parse<string[]>(file, {
      worker: true, skipEmptyLines: 'greedy', encoding: 'UTF-8',
      chunk(results, parser) {
        delimiter = results.meta.delimiter;
        const fatal = results.errors.find(error => error.code !== 'UndetectableDelimiter');
        if (fatal) failure = `CSV no válido: ${fatal.message}`;
        for (const row of results.data) {
          if (failure) break;
          if (!headers) {
            headers = row.map(h => h.replace(/^\uFEFF/, '').trim());
            if (headers.length > MAX_COLUMNS) failure = 'El CSV supera el límite de 200 columnas.';
            else if (headers.some(h => !h)) failure = 'Todas las columnas deben tener un nombre.';
            else if (new Set(headers).size !== headers.length) failure = 'Las cabeceras deben tener nombres únicos.';
          } else if (row.length !== headers.length) failure = `La fila de datos ${rows.length + 1} tiene ${row.length} campos; se esperaban ${headers.length}.`;
          else if (rows.length >= MAX_ROWS) failure = 'El CSV supera el límite de 100.000 filas.';
          else if (row.some(v => v.includes('\uFFFD') || v.includes('\0'))) failure = 'Usa un archivo de texto CSV con codificación UTF-8.';
          // Explicit, per-load markers only. Personal CSVs keep NA/NULL as text
          // unless configured; the bundled original CSV is never rewritten.
          else rows.push(missingTokens.size ? row.map(value => missingTokens.has(value) ? '' : value) : row);
        }
        onProgress?.(rows.length);
        if (failure) { parser.abort(); reject(new Error(failure)); }
      },
      complete() {
        if (failure) return;
        if (!headers || !rows.length) { reject(new Error('El CSV debe incluir una cabecera y al menos una fila de datos.')); return; }
        const columns = profile(headers, rows);
        resolve({ name: file.name, bytes: file.size, headers, rows, columns, missing: columns.reduce((sum, c) => sum + c.missing, 0), delimiter });
      },
      error(error) { reject(new Error(`No se pudo leer el archivo: ${error.message}`)); },
    });
  });
}
