export type VariableType = 'Numérica' | 'Booleana' | 'Fecha' | 'Texto' | 'Sin datos';
export interface ColumnProfile { name: string; type: VariableType; missing: number; unique: number }
export interface Dataset { name: string; bytes: number; headers: string[]; rows: string[][]; columns: ColumnProfile[]; missing: number; delimiter: string }
