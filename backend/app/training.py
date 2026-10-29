from . import config as limits
from pathlib import Path
import time
import warnings
import sklearn
import scipy
import numpy as np

from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from .evaluation import evaluate
from .preprocessing import build_preprocessor, fitted_pipeline_summary
from .schemas import ExperimentConfig
from .validation import DataError, DataSplit, prepare_data, read_csv_bytes, read_csv_file, split_data


def estimator(config: ExperimentConfig):
    seed = config.seed
    tree_limits = {'max_depth': limits.TREE_MAX_DEPTH, 'max_leaf_nodes': limits.TREE_MAX_LEAVES}
    return {
        'logistic_regression': lambda: LogisticRegression(max_iter=limits.LOGISTIC_MAX_ITER, n_jobs=1, random_state=seed),
        'decision_tree_classifier': lambda: DecisionTreeClassifier(random_state=seed, **tree_limits),
        'random_forest_classifier': lambda: RandomForestClassifier(n_estimators=limits.FOREST_TREES, random_state=seed, n_jobs=1, **tree_limits),
        'linear_regression': lambda: LinearRegression(n_jobs=1),
        'decision_tree_regressor': lambda: DecisionTreeRegressor(random_state=seed, **tree_limits),
        'random_forest_regressor': lambda: RandomForestRegressor(n_estimators=limits.FOREST_TREES, random_state=seed, n_jobs=1, **tree_limits),
    }[config.model]()


def train_experiment(content: bytes | Path, config: ExperimentConfig, reserved_split=None):
    start = time.perf_counter()
    frame = read_csv_file(content) if isinstance(content, Path) else read_csv_bytes(content)
    data = prepare_data(frame, config)
    if reserved_split is None:
        split = split_data(data, config)
    else:
        train, test = reserved_split['train'], reserved_split['test']
        if len(train) + len(test) != len(data.X) or set(train) & set(test) or set(train) | set(test) != set(data.X.index):
            raise DataError('La partición reservada no coincide con el dataset.')
        split = DataSplit(data.X.loc[train], data.X.loc[test], data.y.loc[train], data.y.loc[test],
                          reserved_split['stratified'], reserved_split['warnings'])
    sizes = {'received': len(frame), 'excluded_target': data.excluded_target, 'usable': len(data.y), 'train': len(split.y_train), 'test': len(split.y_test)}
    excluded_target = data.excluded_target
    class_count = data.y.nunique()
    del frame, data, content
    preprocessor, notes = build_preprocessor(split.X_train, config)
    pipeline = Pipeline([('preprocessing', preprocessor), ('model', estimator(config))])
    try:
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter('always')
            fit_start = time.perf_counter()
            pipeline.fit(split.X_train, split.y_train)
            training_seconds = time.perf_counter() - fit_start
            evaluation = evaluate(pipeline, split.X_test, split.y_test, config.task, config.positive_class)
            summary, summary_notes = fitted_pipeline_summary(preprocessor, split.X_test, config, excluded_target)
            if summary['feature_count'] != pipeline.named_steps['model'].n_features_in_:
                raise DataError('El resumen de características no coincide con el estimador ajustado.')
            notes.extend(summary_notes)
        for warning in captured:
            if issubclass(warning.category, ConvergenceWarning):
                notes.append('El estimador no ha convergido con el límite de iteraciones. Revisa escalado, datos o utiliza otro modelo; no se ajusta automáticamente.')
            else:
                notes.append(f'Aviso del entrenamiento: {warning.message}')
    except (ValueError, TypeError, OverflowError, FloatingPointError) as exc:
        raise DataError('No se pudo entrenar con esta configuración. Revisa los datos y el preprocesamiento.') from exc
    return {
        'api_version': '0.3.1',
        'config': config.model_dump(), 'model_parameters': pipeline.named_steps['model'].get_params(deep=False),
        'task_type': 'regression' if config.task == 'regression' else 'binary' if class_count == 2 else 'multiclass',
        'sizes': sizes,
        'stratified': split.stratified, 'duration_seconds': time.perf_counter() - start,
        'training_seconds': training_seconds, 'pipeline_summary': summary,
        'library_versions': {'scikit-learn': sklearn.__version__, 'scipy': scipy.__version__, 'numpy': np.__version__},
        'evaluation_scope': 'test', **{k: v for k, v in evaluation.items() if k != 'warnings'},
        'warnings': list(dict.fromkeys([*split.warnings, *notes, *evaluation['warnings']])),
    }
