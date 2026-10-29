from typing import Literal

from .config import MAX_COLUMNS, MAX_CATEGORIES

from pydantic import BaseModel, ConfigDict, Field, model_validator

Role = Literal['Numérica', 'Categórica nominal', 'Categórica ordinal', 'Identificador']
Task = Literal['classification', 'regression']
CLASSIFIERS = {'logistic_regression', 'decision_tree_classifier', 'random_forest_classifier'}
REGRESSORS = {'linear_regression', 'decision_tree_regressor', 'random_forest_regressor'}


class VariablePreprocessing(BaseModel):
    model_config = ConfigDict(extra='forbid')
    encoding: Literal['onehot', 'ordinal', 'exclude'] | None = None
    numeric_imputation: Literal['mean', 'median'] | None = None
    scaling: Literal['standard', 'minmax', 'none'] | None = None
    categorical_imputation: Literal['most_frequent', 'constant'] | None = None
    ordinal_categories: list[str] | None = Field(default=None, min_length=1, max_length=MAX_CATEGORIES)

    @model_validator(mode='after')
    def unique_order(self):
        if self.ordinal_categories is not None:
            if len(set(self.ordinal_categories)) != len(self.ordinal_categories) or any(not value.strip() for value in self.ordinal_categories):
                raise ValueError('El orden ordinal debe contener categorías no vacías y sin duplicados.')
        return self


class PreprocessingConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    numeric_imputation: Literal['mean', 'median'] = 'median'
    scaling: Literal['standard', 'minmax', 'none'] = 'standard'
    categorical_imputation: Literal['most_frequent', 'constant'] = 'most_frequent'
    variables: dict[str, VariablePreprocessing] = Field(default_factory=dict, max_length=MAX_COLUMNS)


class ExperimentConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    target: str = Field(min_length=1, max_length=500)
    predictors: list[str] = Field(min_length=1, max_length=MAX_COLUMNS)
    roles: dict[str, Role] = Field(max_length=MAX_COLUMNS)
    task: Task
    model: Literal['logistic_regression', 'decision_tree_classifier', 'random_forest_classifier', 'linear_regression', 'decision_tree_regressor', 'random_forest_regressor']
    test_size: float = Field(default=.2, ge=.1, le=.4, allow_inf_nan=False)
    seed: int = Field(default=42, ge=0, le=4294967295)
    stratify: bool = True
    preprocessing: PreprocessingConfig = Field(default_factory=PreprocessingConfig)
    positive_class: str | None = Field(default=None, max_length=1000)
    target_units: str | None = Field(default=None, max_length=100)

    def active_predictors(self):
        return [name for name in self.predictors if not self.preprocessing.variables.get(name) or self.preprocessing.variables[name].encoding != 'exclude']

    @model_validator(mode='after')
    def consistent(self):
        if self.target in self.predictors:
            raise ValueError('El objetivo no puede ser predictor de sí mismo.')
        if len(set(self.predictors)) != len(self.predictors):
            raise ValueError('Los predictores no pueden estar duplicados.')
        if any(name not in self.roles for name in [self.target, *self.predictors]):
            raise ValueError('Falta el rol de alguna variable seleccionada.')
        if self.model not in (CLASSIFIERS if self.task == 'classification' else REGRESSORS):
            raise ValueError('El modelo no es compatible con el tipo de problema.')
        for name, settings in self.preprocessing.variables.items():
            if name not in self.roles:
                raise ValueError(f'La configuración de «{name}» no corresponde a una variable conocida.')
            if settings.encoding == 'ordinal' and (self.roles[name] != 'Categórica ordinal' or not settings.ordinal_categories):
                raise ValueError('Ordinal Encoding requiere rol ordinal y un orden explícito no vacío.')
            if self.roles[name] == 'Numérica' and settings.encoding in ('onehot', 'ordinal'):
                raise ValueError('Una variable numérica no admite codificación categórica sin corregir antes su rol.')
        if not self.active_predictors():
            raise ValueError('Debe quedar al menos un predictor después de las exclusiones.')
        return self


class ComparisonConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    experiment: ExperimentConfig
    models: list[str] = Field(min_length=2, max_length=3)
    folds: Literal[3] = 3
    primary_metric: str | None = None

    @model_validator(mode='after')
    def compatible_models(self):
        allowed = CLASSIFIERS if self.experiment.task == 'classification' else REGRESSORS
        if len(set(self.models)) != len(self.models) or any(model not in allowed for model in self.models):
            raise ValueError('Selecciona entre dos y tres modelos distintos compatibles con la tarea.')
        return self


class ModelCVConfig(ComparisonConfig):
    models: list[str] = Field(min_length=1, max_length=1)
    return_train_score: Literal[True] = True
