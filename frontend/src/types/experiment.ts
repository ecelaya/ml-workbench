import type { StatisticalRole } from './dataset';
export type Task = 'classification' | 'regression';
export type ModelId = 'logistic_regression' | 'decision_tree_classifier' | 'random_forest_classifier' | 'linear_regression' | 'decision_tree_regressor' | 'random_forest_regressor';
export interface PreprocessingConfig {
  numeric_imputation: 'mean' | 'median';
  scaling: 'standard' | 'minmax' | 'none';
  categorical_imputation: 'most_frequent' | 'constant';
}
export interface ExperimentConfig {
  target: string; predictors: string[]; roles: Record<string, StatisticalRole>;
  task: Task; model: ModelId; test_size: number; seed: number; stratify: boolean;
  preprocessing: PreprocessingConfig;
}
export interface ExperimentResult {
  config: ExperimentConfig;
  model_parameters: Record<string, unknown>;
  task_type: 'binary' | 'multiclass' | 'regression';
  sizes: { received: number; excluded_target: number; usable: number; train: number; test: number };
  stratified: boolean; duration_seconds: number; evaluation_scope: 'test';
  metrics: Record<string, number | null>;
  confusion_matrix: number[][] | null; classes: string[]; positive_class: string | null;
  warnings: string[]; predictions: { actual: number; predicted: number }[];
}
