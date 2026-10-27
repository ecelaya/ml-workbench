export type VariableType = 'Entero' | 'Decimal' | 'Booleano' | 'Fecha' | 'Texto' | 'Sin datos';
export type StatisticalRole = 'Numérica' | 'Categórica nominal' | 'Categórica ordinal' | 'Identificador';
export interface RoleSuggestion { role: StatisticalRole; reason: string; tentative: boolean }
export interface ColumnProfile { name: string; type: VariableType; role: StatisticalRole; suggestion: RoleSuggestion; missing: number; unique: number }
export interface Dataset { name: string; bytes: number; headers: string[]; rows: string[][]; columns: ColumnProfile[]; missing: number; delimiter: string }
