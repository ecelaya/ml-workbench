import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import MinMaxScaler, OneHotEncoder, OrdinalEncoder, StandardScaler

from .config import MAX_TRAIN_CELLS, MAX_DENSE_CELLS
from .schemas import ExperimentConfig, VariablePreprocessing
from .validation import DataError, MAX_CATEGORIES, MAX_ENCODED_FEATURES


def variable_policy(config: ExperimentConfig, name: str):
    defaults = config.preprocessing
    override = defaults.variables.get(name, VariablePreprocessing())
    numeric = config.roles[name] == 'Numérica'
    return {
        'imputation': (override.numeric_imputation or defaults.numeric_imputation) if numeric else (override.categorical_imputation or defaults.categorical_imputation),
        'scaling': (override.scaling or defaults.scaling) if numeric else 'none',
        'encoding': 'none' if numeric else (override.encoding or 'onehot'),
        'order': override.ordinal_categories if override.encoding == 'ordinal' else None,
    }


def build_preprocessor(X_train: pd.DataFrame, config: ExperimentConfig):
    """Group equivalent policies; inspect only train, then fit inside Pipeline."""
    if X_train.shape[0] * X_train.shape[1] > MAX_TRAIN_CELLS:
        raise DataError('Demasiadas celdas de entrenamiento. Reduce filas o predictores.')
    dense_count = sum(variable_policy(config, name)['encoding'] != 'onehot' for name in config.active_predictors())
    if len(X_train) * dense_count > MAX_DENSE_CELLS:
        raise DataError('La matriz supera el presupuesto de celdas densas.')
    groups = {}
    notes = []
    estimated = 0
    active = config.active_predictors()
    ordered = sorted(active, key=lambda name: config.roles[name] != 'Numérica')
    for name in ordered:
        policy = variable_policy(config, name)
        numeric = config.roles[name] == 'Numérica'
        unique = X_train[name].nunique(dropna=True)
        if unique == 0:
            notes.append(f'«{name}» está vacía en train: se conserva con imputación de respaldo (0 numérico o categoría de ausencia).')
        elif unique == 1:
            notes.append(f'«{name}» es constante entre los valores válidos de train.')
        if not numeric:
            if unique > MAX_CATEGORIES:
                raise DataError(f'«{name}» supera {MAX_CATEGORIES:,} categorías en entrenamiento. Exclúyela o revisa su rol.'.replace(',', '.'))
            if unique > 50:
                notes.append(f'«{name}» tiene alta cardinalidad en train ({unique} categorías).')
            if policy['encoding'] == 'ordinal':
                if not policy['order']:
                    raise DataError(f'«{name}» necesita un orden explícito para Ordinal Encoding.')
                if set(X_train[name].dropna()) - set(policy['order']):
                    raise DataError(f'El orden explícito de «{name}» no incluye todas las categorías observadas en train.')
        estimated += max(unique, 1) + 1 if policy['encoding'] == 'onehot' else 1
        kind = 'numeric' if numeric else 'ordinal' if policy['encoding'] == 'ordinal' else 'categorical'
        key = (kind, policy['imputation'], policy['scaling'], tuple(policy['order'] or []))
        groups.setdefault(key, []).append(name)
    if estimated > MAX_ENCODED_FEATURES:
        raise DataError(f'La codificación podría superar {MAX_ENCODED_FEATURES:,} columnas. Selecciona menos predictores categóricos.'.replace(',', '.'))
    transformers, metadata, counters = [], {}, {}
    for (kind, strategy, scaling, order), columns in groups.items():
        number = counters.get(kind, 0)
        counters[kind] = number + 1
        group_name = kind if number == 0 else f'{kind}_{number}'
        steps = [('imputer', SimpleImputer(strategy=strategy, fill_value='__ML_WORKBENCH_MISSING__' if kind != 'numeric' else None, keep_empty_features=True))]
        if kind == 'numeric' and scaling != 'none':
            steps.append(('scaler', StandardScaler() if scaling == 'standard' else MinMaxScaler()))
        elif kind == 'categorical':
            steps.append(('encoder', OneHotEncoder(handle_unknown='ignore', sparse_output=True)))
        elif kind == 'ordinal':
            steps.append(('encoder', OrdinalEncoder(categories=[list(order) for _ in columns], handle_unknown='use_encoded_value', unknown_value=-1)))
        transformers.append((group_name, Pipeline(steps), columns))
        metadata[group_name] = {'columns': columns, 'kind': kind}
    preprocessor = ColumnTransformer(transformers, remainder='drop', sparse_threshold=1.0)
    preprocessor._workbench_groups = metadata
    return preprocessor, notes


def fitted_pipeline_summary(preprocessor, X_test: pd.DataFrame, config: ExperimentConfig, excluded_target: int):
    """Report fitted objects, never merely configured or unselected policies."""
    rows, notes = [], []
    for group_name, metadata in preprocessor._workbench_groups.items():
        fitted = preprocessor.named_transformers_[group_name]
        imputer = fitted.named_steps['imputer']
        encoder = fitted.named_steps.get('encoder')
        imputed_test = imputer.transform(X_test[metadata['columns']]) if encoder is not None else None
        for i, name in enumerate(metadata['columns']):
            policy = variable_policy(config, name)
            statistic = imputer.statistics_[i]
            if isinstance(statistic, np.generic):
                statistic = statistic.item()
            unknown = 0
            if encoder is not None:
                known = set(encoder.categories_[i])
                unknown = sum(value not in known for value in imputed_test[:, i])
                if unknown:
                    action = 'código -1, reservado fuera del orden' if metadata['kind'] == 'ordinal' else 'vector One-Hot de ceros'
                    notes.append(f'«{name}»: {unknown} valores en test no pertenecen a las categorías de la codificación; se representan como {action}. No se reajusta el encoder con test.')
            rows.append({
                'variable': name, 'role': config.roles[name], 'imputation': imputer.strategy,
                'imputation_value': statistic, 'encoding': policy['encoding'],
                'scaling': 'standard' if isinstance(fitted.named_steps.get('scaler'), StandardScaler) else 'minmax' if 'scaler' in fitted.named_steps else 'none',
                'ordinal_categories': list(encoder.categories_[i]) if metadata['kind'] == 'ordinal' else None,
                'unknown_test_values': unknown,
            })
    names = preprocessor.get_feature_names_out().tolist()
    return {
        'original_predictors': config.predictors,
        'used_predictors': config.active_predictors(),
        'discarded_predictors': [{'variable': name, 'reason': 'Excluido explícitamente en preprocesamiento'} for name in config.predictors if name not in config.active_predictors()],
        'transformations': rows, 'feature_count': len(names), 'feature_names': names,
        'excluded_target': excluded_target,
    }, notes
