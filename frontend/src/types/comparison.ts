import type { ExperimentConfig, ModelId } from './experiment';
export interface ComparisonConfig { experiment: ExperimentConfig; models: ModelId[]; folds: 3; primary_metric: string }
export interface MetricAggregate { mean: number | null; std: number | null; valid_folds: number; values: (number | null)[] }
export interface ComparisonModel {
  train_metrics?: Record<string, MetricAggregate>;
  model: ModelId; metrics: Record<string, MetricAggregate>; training_seconds: number;
  folds: { fold: number; metrics: Record<string, number | null>; train_metrics?: Record<string, number | null>; train_undefined_reasons?: Record<string, string>; undefined_reasons: Record<string, string>; training_seconds: number; train_n: number; validation_n: number; warnings: string[] }[];
}
export interface ComparisonResult {
  api_version: '0.4.0'; evaluation_scope: 'cross_validation'; session_token: string; expires_at: number;
  primary_metric: string; metric_names: string[]; models: ComparisonModel[]; best_model: ModelId | null;
  folds: 3; splitter: string; seed: number; duration_seconds: number; std_convention: string; warnings: string[];
  sizes: { received: number; excluded_target: number; train: number; test: number };
}
