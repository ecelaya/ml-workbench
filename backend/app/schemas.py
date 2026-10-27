from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Role = Literal['Numérica', 'Categórica nominal', 'Categórica ordinal', 'Identificador']
Task = Literal['classification', 'regression']
CLASSIFIERS = {'logistic_regression', 'decision_tree_classifier', 'random_forest_classifier'}
REGRESSORS = {'linear_regression', 'decision_tree_regressor', 'random_forest_regressor'}


class PreprocessingConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    numeric_imputation: Literal['mean', 'median'] = 'median'
    scaling: Literal['standard', 'minmax', 'none'] = 'standard'
    categorical_imputation: Literal['most_frequent', 'constant'] = 'most_frequent'


class ExperimentConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    target: str = Field(min_length=1, max_length=500)
    predictors: list[str] = Field(min_length=1, max_length=200)
    roles: dict[str, Role] = Field(max_length=200)
    task: Task
    model: Literal['logistic_regression', 'decision_tree_classifier', 'random_forest_classifier', 'linear_regression', 'decision_tree_regressor', 'random_forest_regressor']
    test_size: float = Field(default=.2, ge=.1, le=.4, allow_inf_nan=False)
    seed: int = Field(default=42, ge=0, le=4294967295)
    stratify: bool = True
    preprocessing: PreprocessingConfig = Field(default_factory=PreprocessingConfig)

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
        return self
