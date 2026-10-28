import numpy as np
import pandas as pd
import pytest

from app.preprocessing import build_preprocessor
from app.schemas import ExperimentConfig, PreprocessingConfig
from app.validation import DataError, PreparedData, prepare_data, read_csv_bytes, split_data


def test_imputation_scaling_and_encoder_fit_only_training(base_config):
    train = pd.DataFrame({'x': [1., 3., np.nan], 'category': ['a', 'a', np.nan]})
    test = pd.DataFrame({'x': [1000., np.nan], 'category': ['never-seen', np.nan]})
    preprocessor, _ = build_preprocessor(train, base_config)
    preprocessor.fit(train)
    num = preprocessor.named_transformers_['numeric']
    cat = preprocessor.named_transformers_['categorical']
    assert num.named_steps['imputer'].statistics_[0] == 2
    assert num.named_steps['scaler'].mean_[0] == 2
    assert list(cat.named_steps['encoder'].categories_[0]) == ['a']
    transformed = preprocessor.transform(test)
    assert transformed.shape == (2, 2)
    assert np.isfinite(transformed.toarray() if hasattr(transformed, 'toarray') else transformed).all()
    # transform(test) must not refit any preprocessing parameter.
    assert num.named_steps['scaler'].mean_[0] == 2
    assert 'never-seen' not in cat.named_steps['encoder'].categories_[0]


@pytest.mark.parametrize('strategy', ['mean', 'median'])
@pytest.mark.parametrize('scaling', ['standard', 'minmax', 'none'])
@pytest.mark.parametrize('categorical', ['most_frequent', 'constant'])
def test_empty_columns_and_unknown_categories(base_config, strategy, scaling, categorical):
    base_config.preprocessing = PreprocessingConfig(numeric_imputation=strategy, scaling=scaling, categorical_imputation=categorical)
    train = pd.DataFrame({'x': [np.nan, np.nan], 'category': [np.nan, np.nan]}, dtype=object)
    test = pd.DataFrame({'x': [100., np.nan], 'category': ['new', np.nan]})
    preprocessor, warnings = build_preprocessor(train, base_config)
    preprocessor.fit(train)
    assert len(warnings) == 2
    result = preprocessor.transform(test)
    assert result.shape[0] == 2
    assert np.isfinite(result.toarray() if hasattr(result, 'toarray') else result).all()


def test_train_test_indexes_disjoint_and_complete(base_config):
    X = pd.DataFrame({'x': range(100), 'category': ['a'] * 100})
    data = PreparedData(X, pd.Series(['0', '1'] * 50), 0, [])
    split = split_data(data, base_config)
    assert set(split.X_train.index).isdisjoint(split.X_test.index)
    assert set(split.X_train.index) | set(split.X_test.index) == set(range(100))
    assert split.stratified
    assert len(split.X_test) == 20
    assert split.X_test.index.tolist() == split_data(data, base_config).X_test.index.tolist()


def test_high_cardinality_limit_applies_only_to_train(base_config):
    train = pd.DataFrame({'x': [1., 2.], 'category': ['a', 'b']})
    preprocessor, _ = build_preprocessor(train, base_config)
    preprocessor.fit(train)
    test = pd.DataFrame({'x': np.arange(3000), 'category': [f'test-{i}' for i in range(3000)]})
    assert preprocessor.transform(test).shape[0] == 3000
    with pytest.raises(DataError, match='2.000'):
        build_preprocessor(test, base_config)


def test_csv_does_not_coerce_codes_or_na(base_config):
    frame = read_csv_bytes(b'x,category,target\n1,001,a\n2,NA,b\n3,NULL,a\n4, ,b')
    assert frame.loc[0, 'category'] == '001'
    assert frame.loc[1, 'category'] == 'NA'
    assert frame.loc[2, 'category'] == 'NULL'
    assert pd.isna(frame.loc[3, 'category'])


def test_target_missing_excluded_before_split(base_config):
    frame = pd.DataFrame({'x': [str(i) for i in range(20)], 'category': ['a'] * 20, 'target': ['0', '1'] * 9 + [np.nan, np.nan]})
    data = prepare_data(frame, base_config)
    assert data.excluded_target == 2
    assert len(data.y) == 18
    split = split_data(data, base_config)
    assert 18 not in split.X_train.index and 18 not in split.X_test.index


def test_seed_and_stratification_unviable_are_explicit(base_config):
    X = pd.DataFrame({'x': range(30), 'category': ['a'] * 30})
    data = PreparedData(X, pd.Series(['0'] * 29 + ['1']), 0, [])
    split = split_data(data, base_config)
    assert not split.stratified
    assert any('no viable' in text for text in split.warnings)


def test_predictor_numeric_validation_is_strict(base_config):
    frame = pd.DataFrame({'x': ['invalid'] + ['1'] * 19, 'category': ['a'] * 20, 'target': ['0', '1'] * 10})
    with pytest.raises(DataError, match='no numéricos'):
        prepare_data(frame, base_config)


def test_pipeline_configuration_does_not_fit(base_config):
    train = pd.DataFrame({'x': [1., 2.], 'category': ['a', 'b']})
    preprocessor, _ = build_preprocessor(train, base_config)
    assert not hasattr(preprocessor, 'transformers_')


def test_complete_training_pipeline_cannot_learn_from_test(monkeypatch, base_config):
    from app import training
    base_config.preprocessing.numeric_imputation = 'mean'
    frame = pd.DataFrame({'x': [str(i) for i in range(40)], 'category': ['known'] * 40, 'target': ['0', '1'] * 20})
    split = split_data(prepare_data(frame, base_config), base_config)
    expected_train_mean = split.X_train['x'].mean()
    # Inject a numeric extreme and an unseen category only in held-out rows.
    frame.loc[split.X_test.index, 'x'] = '999999'
    frame.loc[split.X_test.index, 'category'] = 'test-only'
    observed = {}
    original = training.build_preprocessor
    def capture(train, config):
        observed['index'] = set(train.index)
        result = original(train, config)
        observed['preprocessor'] = result[0]
        return result
    monkeypatch.setattr(training, 'build_preprocessor', capture)
    result = training.train_experiment(frame.to_csv(index=False).encode(), base_config)
    prep = observed['preprocessor']
    imputer = prep.named_transformers_['numeric'].named_steps['imputer']
    scaler = prep.named_transformers_['numeric'].named_steps['scaler']
    encoder = prep.named_transformers_['categorical'].named_steps['encoder']
    assert observed['index'] == set(split.X_train.index)
    assert imputer.statistics_[0] == pytest.approx(expected_train_mean)
    assert scaler.mean_[0] == pytest.approx(expected_train_mean)
    assert 'test-only' not in encoder.categories_[0]
    assert result['sizes']['train'] == 32 and result['sizes']['test'] == 8
