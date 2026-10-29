"""Sequential CV on development data only; test is never evaluated here."""
from . import config as limits

import gc
import json
import time
import warnings
from pathlib import Path

import numpy as np
from sklearn.model_selection import KFold, StratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline

from .evaluation import evaluate
from .preprocessing import build_preprocessor
from .schemas import ComparisonConfig, ExperimentConfig
from .training import estimator, train_experiment
from .validation import DataError, prepare_data, read_csv_file, split_data

CLASS_METRICS = ['accuracy', 'precision_macro', 'recall_macro', 'f1_macro']
BINARY_METRICS = ['roc_auc', *CLASS_METRICS, 'precision_positive', 'recall_positive', 'f1_positive']
REG_METRICS = ['mae', 'rmse', 'r2']


def aggregate(scores, metrics):
    result = {}
    for metric in metrics:
        values = [fold['metrics'][metric] for fold in scores]
        valid = [value for value in values if value is not None]
        result[metric] = {'mean': float(np.mean(valid)) if valid else None,
                          'std': float(np.std(valid, ddof=1)) if len(valid) > 1 else None,
                          'valid_folds': len(valid), 'values': values}
    return result


def rank_models(results, metric, folds=3):
    minimize = metric in ('mae', 'rmse')
    def key(row):
        stat = row['metrics'][metric]
        eligible = stat['valid_folds'] == folds and stat['mean'] is not None
        return (not eligible, (stat['mean'] if minimize else -stat['mean']) if eligible else 0)
    ranked = sorted(results, key=key)
    best = ranked[0]['model'] if ranked and ranked[0]['metrics'][metric]['valid_folds'] == folds else None
    return ranked, best


def compare_models(path: Path, settings: ComparisonConfig, directory: Path, return_train_score=False):
    started = time.perf_counter()
    cfg = settings.experiment
    frame = read_csv_file(path)
    data = prepare_data(frame, cfg)
    split = split_data(data, cfg)
    sizes = {'received': len(frame), 'excluded_target': data.excluded_target, 'train': len(split.y_train), 'test': len(split.y_test)}
    binary = cfg.task == 'classification' and data.y.nunique() == 2
    metrics = REG_METRICS if cfg.task == 'regression' else BINARY_METRICS if binary else CLASS_METRICS
    primary = settings.primary_metric or ('rmse' if cfg.task == 'regression' else 'roc_auc' if binary else 'f1_macro')
    if primary not in metrics:
        raise DataError('La métrica principal no es compatible con este problema.')
    positive = cfg.positive_class
    if binary:
        if positive is None:
            raise DataError('Elige explícitamente la clase positiva para la comparación binaria.')
    X, y = split.X_train, split.y_train
    if cfg.task == 'classification':
        if y.value_counts().min() < settings.folds:
            raise DataError('CV estratificada no viable: cada clase de train necesita al menos tres observaciones. Reduce test o añade datos.')
        cv = StratifiedKFold(n_splits=settings.folds, shuffle=True, random_state=cfg.seed)
    else:
        if len(y) < settings.folds * 2:
            raise DataError('CV necesita al menos dos observaciones de validación por fold.')
        cv = KFold(n_splits=settings.folds, shuffle=True, random_state=cfg.seed)
    folds = list(cv.split(X, y))
    reserved = {'train': X.index.tolist(), 'test': split.X_test.index.tolist(),
                'stratified': split.stratified, 'warnings': split.warnings}
    (directory / 'split.json').write_text(json.dumps(reserved), encoding='utf-8')
    # Test references are released before fitting; CV only sees X/y from train.
    del split, frame, data
    results = []
    for model in settings.models:
        candidate = ExperimentConfig.model_validate({**cfg.model_dump(), 'model': model})
        scores = []
        for index, (train, valid) in enumerate(folds):
            prep, notes = build_preprocessor(X.iloc[train], candidate)
            pipeline = Pipeline([('preprocessing', prep), ('model', estimator(candidate))])
            with warnings.catch_warnings(record=True) as captured:
                warnings.simplefilter('always')
                fit_started = time.perf_counter()
                try:
                    if return_train_score:
                        def scorer(fitted, features, target):
                            output = evaluate(fitted, features, target, cfg.task, positive, undefined_nan=True)
                            return {metric: value if value is not None else np.nan for metric, value in output['metrics'].items()}
                        scored = cross_validate(pipeline, X, y, cv=[(train, valid)], scoring=scorer,
                                                return_train_score=True, n_jobs=1, error_score='raise')
                        duration = float(scored['fit_time'][0])
                        evaluation = {'metrics': {metric: float(scored[f'test_{metric}'][0]) for metric in metrics}, 'warnings': []}
                        train_evaluation = {'metrics': {metric: float(scored[f'train_{metric}'][0]) for metric in metrics}}
                    else:
                        pipeline.fit(X.iloc[train], y.iloc[train])
                        duration = time.perf_counter() - fit_started
                        evaluation = evaluate(pipeline, X.iloc[valid], y.iloc[valid], cfg.task, positive, undefined_nan=True)
                except (ValueError, TypeError, OverflowError, FloatingPointError) as exc:
                    raise DataError('No se pudo completar un fold. Revisa los datos, escalado y preprocesamiento.') from exc
            values, reasons = {}, {}
            for metric in metrics:
                value = evaluation['metrics'].get(metric)
                values[metric] = value if value is not None and np.isfinite(value) else None
                if values[metric] is None:
                    reasons[metric] = ('Objetivo constante o muestra insuficiente.' if metric == 'r2' else
                                       'Denominador nulo, clase sin soporte/predicciones o ROC-AUC sin ambas clases.')
            scores.append({'fold': index + 1, 'metrics': values, 'undefined_reasons': reasons,
                           'training_seconds': duration, 'train_n': len(train), 'validation_n': len(valid),
                           'warnings': [*notes, *evaluation['warnings'], *[str(w.message) for w in captured]]})
            if return_train_score:
                scores[-1]['train_metrics'] = {metric: value if value is not None and np.isfinite(value) else None for metric, value in train_evaluation['metrics'].items()}
                scores[-1]['train_undefined_reasons'] = {metric: 'Denominador nulo, objetivo constante o muestra insuficiente.' for metric, value in scores[-1]['train_metrics'].items() if value is None}
            del pipeline, prep, evaluation
            gc.collect()
        results.append({'model': model, 'folds': scores, 'metrics': aggregate(scores, metrics),
                        'training_seconds': sum(fold['training_seconds'] for fold in scores)})
        if return_train_score:
            results[-1]['train_metrics'] = aggregate([{'metrics': fold['train_metrics']} for fold in scores], metrics)
    ranked, best = rank_models(results, primary, settings.folds)
    return {'api_version': '0.4.0', 'evaluation_scope': 'cross_validation', 'primary_metric': primary,
            'metric_names': metrics, 'models': ranked, 'best_model': best, 'folds': settings.folds,
            'splitter': type(cv).__name__, 'seed': cfg.seed, 'sizes': sizes,
            'duration_seconds': time.perf_counter() - started,
            'warnings': reserved['warnings'], 'std_convention': 'Muestral (ddof=1), descriptiva; no es un intervalo de confianza.'}


def evaluate_selected(path: Path, settings: ComparisonConfig, directory: Path):
    selection = (directory / 'selection.txt').read_text(encoding='utf-8')
    if selection not in settings.models:
        raise DataError('El modelo no pertenece a la comparación reservada.')
    cfg = ExperimentConfig.model_validate({**settings.experiment.model_dump(), 'model': selection})
    reserved = json.loads((directory / 'split.json').read_text(encoding='utf-8'))
    return train_experiment(path, cfg, reserved_split=reserved)
