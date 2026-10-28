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
from .validation import DataError, prepare_data, read_csv_bytes, split_data


def estimator(config: ExperimentConfig):
    seed = config.seed
    return {
        'logistic_regression': lambda: LogisticRegression(max_iter=1000, random_state=seed),
        'decision_tree_classifier': lambda: DecisionTreeClassifier(random_state=seed),
        'random_forest_classifier': lambda: RandomForestClassifier(n_estimators=100, random_state=seed, n_jobs=1),
        'linear_regression': lambda: LinearRegression(),
        'decision_tree_regressor': lambda: DecisionTreeRegressor(random_state=seed),
        'random_forest_regressor': lambda: RandomForestRegressor(n_estimators=100, random_state=seed, n_jobs=1),
    }[config.model]()


def train_experiment(content: bytes, config: ExperimentConfig):
    start = time.perf_counter()
    frame = read_csv_bytes(content)
    data = prepare_data(frame, config)
    split = split_data(data, config)
    preprocessor, notes = build_preprocessor(split.X_train, config)
    pipeline = Pipeline([('preprocessing', preprocessor), ('model', estimator(config))])
    try:
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter('always')
            fit_start = time.perf_counter()
            pipeline.fit(split.X_train, split.y_train)
            training_seconds = time.perf_counter() - fit_start
            evaluation = evaluate(pipeline, split.X_test, split.y_test, config.task, config.positive_class)
            summary, summary_notes = fitted_pipeline_summary(preprocessor, split.X_test, config, data.excluded_target)
            if summary['feature_count'] != pipeline.named_steps['model'].n_features_in_:
                raise DataError('El resumen de características no coincide con el estimador ajustado.')
            notes.extend(summary_notes)
        for warning in captured:
            if issubclass(warning.category, ConvergenceWarning):
                notes.append('El estimador no ha convergido con el límite de iteraciones. Revisa escalado, datos o utiliza otro modelo; no se ajusta automáticamente.')
            else:
                notes.append(f'Aviso del entrenamiento: {warning.message}')
    except (ValueError, TypeError, OverflowError, FloatingPointError) as exc:
        raise DataError(f'No se pudo entrenar con esta configuración: {exc}') from exc
    return {
        'api_version': '0.3.1',
        'config': config.model_dump(), 'model_parameters': pipeline.named_steps['model'].get_params(deep=False),
        'task_type': 'regression' if config.task == 'regression' else 'binary' if data.y.nunique() == 2 else 'multiclass',
        'sizes': {'received': len(frame), 'excluded_target': data.excluded_target, 'usable': len(data.y), 'train': len(split.y_train), 'test': len(split.y_test)},
        'stratified': split.stratified, 'duration_seconds': time.perf_counter() - start,
        'training_seconds': training_seconds, 'pipeline_summary': summary,
        'library_versions': {'scikit-learn': sklearn.__version__, 'scipy': scipy.__version__, 'numpy': np.__version__},
        'evaluation_scope': 'test', **{k: v for k, v in evaluation.items() if k != 'warnings'},
        'warnings': list(dict.fromkeys([*split.warnings, *notes, *evaluation['warnings']])),
    }
