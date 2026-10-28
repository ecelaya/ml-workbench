import numpy as np
import pandas as pd
import pytest
from pydantic import ValidationError

from app.preprocessing import build_preprocessor, fitted_pipeline_summary
from app.schemas import ExperimentConfig, VariablePreprocessing
from app.training import train_experiment
from app.validation import DataError, prepare_data


def ordinal_config(base_config):
    base_config.roles['category'] = 'Categórica ordinal'
    base_config.preprocessing.variables['category'] = VariablePreprocessing(encoding='ordinal', ordinal_categories=['low', 'medium', 'high'])
    return base_config


def test_explicit_ordinal_order_and_unknowns_are_not_inferred(base_config):
    config = ordinal_config(base_config)
    train = pd.DataFrame({'x': [1., 2., 3.], 'category': ['high', 'low', 'medium']})
    test = pd.DataFrame({'x': [0., 0., 0., 0.], 'category': ['low', 'high', 'unknown', 'medium']})
    processor, _ = build_preprocessor(train, config)
    processor.fit(train)
    ordinal = processor.named_transformers_['ordinal']
    assert ordinal.transform(test[['category']]).ravel().tolist() == [0., 2., -1., 1.]
    assert ordinal.named_steps['encoder'].categories_[0].tolist() == ['low', 'medium', 'high']
    summary, warnings = fitted_pipeline_summary(processor, test, config, 0)
    assert summary['feature_count'] == 2
    assert summary['transformations'][1]['unknown_test_values'] == 1
    assert warnings


def test_nominal_ordinal_requires_role_decision_and_order(base_config):
    raw = base_config.model_dump()
    raw['preprocessing']['variables']['category'] = {'encoding': 'ordinal', 'ordinal_categories': ['a', 'b']}
    with pytest.raises(ValidationError, match='rol ordinal'):
        ExperimentConfig.model_validate(raw)
    raw['roles']['category'] = 'Categórica ordinal'
    raw['preprocessing']['variables']['category']['ordinal_categories'] = ['a', 'a']
    with pytest.raises(ValidationError, match='duplicados'):
        ExperimentConfig.model_validate(raw)
    raw['preprocessing']['variables']['category'].pop('ordinal_categories')
    with pytest.raises(ValidationError, match='orden explícito'):
        ExperimentConfig.model_validate(raw)


def test_order_missing_training_level_is_rejected(base_config):
    config = ordinal_config(base_config)
    with pytest.raises(DataError, match='no incluye'):
        build_preprocessor(pd.DataFrame({'x': [1., 2.], 'category': ['low', 'unlisted']}), config)


def test_exclusion_is_applied_before_numeric_conversion_and_reported(base_config):
    base_config.preprocessing.variables['x'] = VariablePreprocessing(encoding='exclude', scaling='minmax', numeric_imputation='mean')
    frame = pd.DataFrame({'x': ['not-a-number'] * 40, 'category': ['a', 'b'] * 20, 'target': ['0', '1'] * 20})
    prepared = prepare_data(frame, base_config)
    assert list(prepared.X) == ['category']
    result = train_experiment(frame.to_csv(index=False).encode(), base_config)
    report = result['pipeline_summary']
    assert report['original_predictors'] == ['x', 'category']
    assert report['used_predictors'] == ['category']
    assert report['discarded_predictors'][0]['variable'] == 'x'
    assert [row['variable'] for row in report['transformations']] == ['category']
    assert report['transformations'][0]['scaling'] == 'none'


def test_variable_numeric_overrides_and_feature_names_match_fitted_output(base_config):
    base_config.predictors = ['x', 'second', 'category']
    base_config.roles['second'] = 'Numérica'
    base_config.preprocessing.variables['x'] = VariablePreprocessing(numeric_imputation='mean', scaling='none')
    base_config.preprocessing.variables['second'] = VariablePreprocessing(numeric_imputation='median', scaling='minmax')
    train = pd.DataFrame({'x': [0., 10., np.nan], 'second': [0., 4., np.nan], 'category': ['a', 'b', np.nan]})
    processor, _ = build_preprocessor(train, base_config)
    output = processor.fit_transform(train)
    report, _ = fitted_pipeline_summary(processor, train, base_config, 3)
    assert report['feature_count'] == output.shape[1] == len(report['feature_names'])
    assert report['feature_names'] == processor.get_feature_names_out().tolist()
    by_name = {row['variable']: row for row in report['transformations']}
    assert by_name['x']['imputation_value'] == 5
    assert by_name['x']['scaling'] == 'none'
    assert by_name['second']['imputation_value'] == 2
    assert by_name['second']['scaling'] == 'minmax'
    assert report['excluded_target'] == 3


def test_empty_ordinal_column_preserves_unknown_sentinel(base_config):
    config = ordinal_config(base_config)
    train = pd.DataFrame({'x': [1., 2.], 'category': [np.nan, np.nan]}, dtype=object)
    processor, notes = build_preprocessor(train, config)
    processor.fit(train)
    result = processor.transform(pd.DataFrame({'x': [3.], 'category': ['new']}))
    assert result.shape[1] == 2
    assert notes


def test_no_leakage_with_custom_numeric_and_ordinal_policies(base_config):
    config = ordinal_config(base_config)
    config.preprocessing.variables['x'] = VariablePreprocessing(numeric_imputation='mean', scaling='minmax')
    train = pd.DataFrame({'x': [1., 3., np.nan], 'category': ['low', 'high', np.nan]})
    test = pd.DataFrame({'x': [1000.], 'category': ['unseen']})
    processor, _ = build_preprocessor(train, config)
    processor.fit(train)
    processor.transform(test)
    numeric = processor.named_transformers_['numeric']
    assert numeric.named_steps['imputer'].statistics_[0] == 2.
    assert numeric.named_steps['scaler'].data_max_[0] == 3.
    assert 'unseen' not in processor.named_transformers_['ordinal'].named_steps['encoder'].categories_[0]
