import type { RoleSuggestion, StatisticalRole, VariableType } from '../types/dataset';
import { numericValue } from './statistics';

export function inferStorage(values: readonly string[]): VariableType {
  if (!values.length) return 'Sin datos';
  if (values.every(v => /^(true|false)$/i.test(v))) return 'Booleano';
  if (values.every(v => numericValue(v) !== null)) return values.every(v => /^[+-]?\d+$/.test(v)) ? 'Entero' : 'Decimal';
  if (values.every(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v)) return 'Fecha';
  return 'Texto';
}

// Token boundaries include snake_case, punctuation, camelCase and acronym endings.
// Never match substrings such as "id" in "humidity" or "paid".
function tokens(name: string): string[] {
  return name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
export interface RoleMetadata { role?: StatisticalRole; orderedValues?: readonly string[] }
export function inferRole(name: string, values: readonly string[], type: VariableType, metadata?: RoleMetadata): RoleSuggestion {
  const suggest = (role: StatisticalRole, reason: string, tentative = false): RoleSuggestion => ({ role, reason, tentative });
  if (metadata?.role) return suggest(metadata.role, 'Rol indicado en los metadatos.');
  const distinct = [...new Set(values)];
  if (metadata?.orderedValues && new Set(metadata.orderedValues).size >= 2 && values.length && distinct.every(v => metadata.orderedValues!.includes(v))) {
    return suggest('Categórica ordinal', 'Los metadatos proporcionan un orden para todos los valores observados.');
  }
  const parts = tokens(name);
  const has = (words: string[]) => parts.some(part => words.includes(part));
  const n = values.length, k = distinct.length, ratio = n ? k / n : 0;
  if (has(['id', 'identifier', 'identificador', 'uuid', 'guid'])) return suggest('Identificador', 'El nombre contiene un token de identificación. No garantiza unicidad.');
  if (!n) return suggest('Categórica nominal', 'Sin valores observados: no se puede inferir significado estadístico.', true);
  if (n >= 3 && ratio >= .95 && values.every(v => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v))) {
    return suggest('Identificador', 'Formato UUID y al menos un 95% de valores únicos.');
  }
  if (has(['ticket', 'reference', 'referencia', 'code', 'codigo', 'serial', 'folio', 'booking']) && n >= 5 && ratio >= .5 && k >= 3) {
    return suggest('Identificador', `Posible identificador: nombre de referencia y ${Math.round(ratio * 100)}% de valores únicos; admite referencias compartidas.`, true);
  }
  const numeric = type === 'Entero' || type === 'Decimal';
  const numbers = numeric ? values.map(v => Number(v)) : [];
  const numericUnique = new Set(numbers);
  if (type === 'Booleano' || (numeric && numericUnique.size === 2 && numericUnique.has(0) && numericUnique.has(1))) {
    return suggest('Categórica nominal', 'Variable binaria: dos estados observados, sin asumir una magnitud u orden.');
  }
  const orderedName = has(['level', 'nivel', 'rank', 'rango', 'grade', 'grado', 'stage', 'etapa', 'tier', 'priority', 'prioridad', 'class', 'clase']) || parts.some(p => /^[a-z]class$/.test(p));
  const orderedLabels = [['low', 'medium', 'high'], ['bajo', 'medio', 'alto'], ['baja', 'media', 'alta']];
  const orderedNumbers = numeric && k >= 2 && k <= 20 && numbers.every(v => Number.isInteger(v) && v >= 0 && v <= 20);
  if (orderedName && (orderedNumbers || (k >= 2 && orderedLabels.some(labels => distinct.every(v => labels.includes(v.toLowerCase())))))) {
    return suggest('Categórica ordinal', 'Nombre asociado a una escala y valores compatibles con niveles ordenados; revisa el significado del orden.', true);
  }
  if (numeric && has(['category', 'categoria', 'status', 'estado', 'type', 'tipo', 'group', 'grupo', 'code', 'codigo']) && k <= 20) {
    return suggest('Categórica nominal', 'Nombre de categoría o código y cardinalidad reducida; no se presupone un orden.', true);
  }
  const measurementName = has(['age', 'edad', 'fare', 'price', 'precio', 'count', 'cantidad', 'total', 'temperature', 'temperatura', 'height', 'weight', 'time', 'duration', 'score']);
  if (type === 'Entero' && n >= 20 && ratio === 1 && !measurementName && (numbers[0] === 0 || numbers[0] === 1) && numbers.every((v, i) => i === 0 || v === numbers[i - 1]! + 1)) {
    return suggest('Identificador', 'Posible índice: secuencia consecutiva desde 0 o 1, sin repetidos y con al menos 20 observaciones.', true);
  }
  if (numeric) return suggest('Numérica', 'Valores numéricos sin evidencia suficiente de códigos o niveles. Pocos enteros distintos también pueden ser conteos.', true);
  return suggest('Categórica nominal', type === 'Fecha' ? 'Fecha almacenada; no se convierte automáticamente en magnitud numérica.' : 'Sin evidencia suficiente de un orden o de una magnitud cuantitativa.', true);
}
