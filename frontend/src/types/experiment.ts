import type { StatisticalRole } from './dataset';
export type Task = 'classification' | 'regression';
export type ModelId = 'logistic_regression' | 'decision_tree_classifier' | 'random_forest_classifier' | 'linear_regression' | 'decision_tree_regressor' | 'random_forest_regressor';
export interface VariablePreprocessing {
  encoding?: 'onehot' | 'ordinal' | 'exclude';
  numeric_imputation?: 'mean' | 'median';
  scaling?: 'standard' | 'minmax' | 'none';
  categorical_imputation?: 'most_frequent' | 'constant';
  ordinal_categories?: string[];
}
export interface PreprocessingConfig {
  numeric_imputation: 'mean' | 'median';
  scaling: 'standard' | 'minmax' | 'none';
  categorical_imputation: 'most_frequent' | 'constant';
  variables?: Record<string, VariablePreprocessing>;
}
export interface ExperimentConfig {
  target: string; predictors: string[]; roles: Record<string, StatisticalRole>;
  task: Task; model: ModelId; test_size: number; seed: number; stratify: boolean;
  preprocessing: PreprocessingConfig;
  positive_class?: string | null;
  target_units?: string | null;
}
export interface PipelineSummary {
  original_predictors: string[]; used_predictors: string[];
  discarded_predictors: { variable: string; reason: string }[];
  transformations: { variable: string; role: StatisticalRole; imputation: string; imputation_value: string | number | null; encoding: string; scaling: string; ordinal_categories: string[] | null; unknown_test_values: number }[];
  feature_count: number; feature_names: string[]; excluded_target: number;
}
export interface ExperimentResult {
  api_version: '0.3.1';
  config: ExperimentConfig;
  model_parameters: Record<string, unknown>;
  task_type: 'binary' | 'multiclass' | 'regression';
  sizes: { received: number; excluded_target: number; usable: number; train: number; test: number };
  stratified: boolean; duration_seconds: number; evaluation_scope: 'test';
  training_seconds: number; pipeline_summary: PipelineSummary;
  library_versions: Record<string, string>;
  metrics: Record<string, number | null>;
  confusion_matrix: number[][] | null; classes: string[]; positive_class: string | null;
  confusion_matrix_normalized: number[][] | null;
  class_metrics: { label: string; precision: number; recall: number; f1: number; support: number }[];
  warnings: string[]; predictions: { actual: number; predicted: number; residual: number }[];
  regression_bounds: [number, number] | null; residual_bounds: [number, number] | null;
}
