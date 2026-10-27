import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import MinMaxScaler, OneHotEncoder, StandardScaler

from .schemas import ExperimentConfig
from .validation import DataError, MAX_CATEGORIES, MAX_ENCODED_FEATURES


def build_preprocessor(X_train: pd.DataFrame, config: ExperimentConfig):
    """Configure transformations from training data only; fit happens in Pipeline."""
    numeric = [name for name in config.predictors if config.roles[name] == 'Numérica']
    categorical = [name for name in config.predictors if name not in numeric]
    estimated = len(numeric)
    warnings = []
    for name in config.predictors:
        unique = X_train[name].nunique(dropna=True)
        if unique == 0:
            warnings.append(f'«{name}» está vacía en train: se conserva con imputación de respaldo (0 numérico o categoría de ausencia).')
        elif unique == 1:
            warnings.append(f'«{name}» es constante entre los valores válidos de train.')
        if name in categorical:
            if unique > MAX_CATEGORIES:
                raise DataError(f'«{name}» supera 2.000 categorías en entrenamiento. Exclúyela o revisa su rol.')
            estimated += max(unique, 1) + 1
            if unique > 50:
                warnings.append(f'«{name}» tiene alta cardinalidad en train ({unique} categorías); OneHotEncoder usará representación dispersa.')
    if estimated > MAX_ENCODED_FEATURES:
        raise DataError('La codificación podría superar 10.000 columnas. Selecciona menos predictores categóricos.')
    prep = config.preprocessing
    num_steps = [('imputer', SimpleImputer(strategy=prep.numeric_imputation, keep_empty_features=True))]
    if prep.scaling != 'none':
        num_steps.append(('scaler', StandardScaler() if prep.scaling == 'standard' else MinMaxScaler()))
    num_pipeline = Pipeline(num_steps)
    cat_pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy=prep.categorical_imputation, fill_value='__ML_WORKBENCH_MISSING__', keep_empty_features=True)),
        ('encoder', OneHotEncoder(handle_unknown='ignore', sparse_output=True)),
    ])
    transformers = []
    if numeric:
        transformers.append(('numeric', num_pipeline, numeric))
    if categorical:
        transformers.append(('categorical', cat_pipeline, categorical))
    return ColumnTransformer(transformers, remainder='drop', sparse_threshold=1.0), warnings
