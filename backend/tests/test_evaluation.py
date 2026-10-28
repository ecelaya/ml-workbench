import math
import warnings

import numpy as np
import pandas as pd
import pytest

from app.evaluation import evaluate
from app.training import train_experiment


class FixedClassifier:
    def __init__(self, prediction, classes, probabilities):
        self.prediction = np.array(prediction)
        self.classes_ = np.array(classes)
        self.probabilities = np.array(probabilities)

    def predict(self, X):
        return self.prediction

    def predict_proba(self, X):
        return self.probabilities


def test_binary_metrics_against_independent_confusion_counts_and_auc_ranking():
    # Positive class is the FIRST probability column and is not the number 1.
    truth = pd.Series(['healthy'] * 5 + ['ill'] * 3)
    prediction = ['healthy'] * 3 + ['ill', 'ill', 'healthy', 'ill', 'ill']
    scores = [.9, .8, .7, .4, .3, .6, .2, .1]
    model = FixedClassifier(prediction, ['healthy', 'ill'], [[p, 1 - p] for p in scores])
    result = evaluate(model, pd.DataFrame(index=range(8)), truth, 'classification', 'healthy')
    m = result['metrics']
    assert m['accuracy'] == 5 / 8
    assert m['precision_positive'] == 3 / 4
    assert m['recall_positive'] == m['sensitivity'] == 3 / 5
    assert m['f1_positive'] == pytest.approx(2 / 3)
    assert m['specificity'] == 2 / 3
    assert m['precision_macro'] == (.75 + .5) / 2
    assert m['recall_macro'] == pytest.approx((3 / 5 + 2 / 3) / 2)
    assert m['f1_macro'] == pytest.approx((2 / 3 + 4 / 7) / 2)
    independent_auc = sum(a > b for a in scores[:5] for b in scores[5:]) / 15
    assert m['roc_auc'] == pytest.approx(independent_auc)
    assert result['positive_class'] == 'healthy'
    assert result['confusion_matrix'] == [[3, 2], [1, 2]]
    assert np.allclose(result['confusion_matrix_normalized'], [[.6, .4], [1 / 3, 2 / 3]])
    assert [row['support'] for row in result['class_metrics']] == [5, 3]


def test_multiclass_support_and_macro_have_no_binary_metrics():
    truth = pd.Series(['cat', 'cat', 'dog', 'dog', 'bird', 'bird'])
    model = FixedClassifier(['cat', 'dog', 'dog', 'bird', 'bird', 'cat'], ['bird', 'cat', 'dog'], np.zeros((6, 3)))
    result = evaluate(model, pd.DataFrame(index=range(6)), truth, 'classification')
    assert set(result['metrics']) == {'accuracy', 'precision_macro', 'recall_macro', 'f1_macro'}
    assert all(value == .5 for value in result['metrics'].values())
    assert result['positive_class'] is None
    for row in result['class_metrics']:
        assert row['support'] == 2
        assert row['precision'] == row['recall'] == row['f1'] == .5


def test_absent_test_class_has_no_auc_or_fake_normalized_support():
    model = FixedClassifier(['yes', 'yes'], ['no', 'yes'], [[.2, .8]] * 2)
    result = evaluate(model, pd.DataFrame(index=range(2)), pd.Series(['yes', 'yes']), 'classification', 'yes')
    assert result['metrics']['roc_auc'] is None
    assert result['metrics']['specificity'] is None
    assert result['confusion_matrix'][0] == [0, 0]
    assert result['class_metrics'][0]['support'] == 0
    assert result['warnings']


class FixedRegressor:
    def __init__(self, prediction):
        self.prediction = np.array(prediction)

    def predict(self, X):
        return self.prediction


def test_regression_metrics_residuals_and_negatives_against_arithmetic():
    actual = pd.Series([-3., -1., 2., 5.])
    prediction = [-2., -2., 1., 7.]
    result = evaluate(FixedRegressor(prediction), pd.DataFrame(index=range(4)), actual, 'regression')
    assert result['metrics']['mae'] == 1.25
    assert result['metrics']['rmse'] == pytest.approx(math.sqrt(7 / 4))
    assert result['metrics']['r2'] == pytest.approx(1 - 7 / 36.75)
    assert result['regression_bounds'] == [-3., 7.]
    assert result['residual_bounds'] == [-2., 1.]
    assert [row['residual'] for row in result['predictions']] == [-1., 1., 1., -2.]
    assert result['predictions'][0]['predicted'] == -2.


def test_sampling_is_reproducible_but_metrics_and_limits_use_all_test():
    actual = pd.Series(np.arange(1001, dtype=float))
    actual.iloc[1] = 1_000_000  # Not included by the deterministic 500-point sample.
    model = FixedRegressor(actual.to_numpy() + 1)
    first = evaluate(model, pd.DataFrame(index=range(1001)), actual, 'regression')
    second = evaluate(model, pd.DataFrame(index=range(1001)), actual, 'regression')
    assert first['predictions'] == second['predictions']
    assert len(first['predictions']) == 500
    assert max(point['actual'] for point in first['predictions']) < 1_000_000
    assert first['regression_bounds'][1] == 1_000_001
    assert first['metrics']['mae'] == first['metrics']['rmse'] == 1.


def test_lbfgs_no_longer_emits_deprecated_disp_or_iprint(base_config):
    base_config.model = 'logistic_regression'
    text = 'x,category,target\n' + '\n'.join(f'{i},a,{i % 2}' for i in range(40))
    with warnings.catch_warnings(record=True) as captured:
        warnings.simplefilter('always')
        result = train_experiment(text.encode(), base_config)
    all_warnings = [str(w.message).lower() for w in captured] + [w.lower() for w in result['warnings']]
    assert not any('iprint' in message or "'disp'" in message for message in all_warnings)


def test_other_warnings_are_not_silenced(monkeypatch, base_config):
    from app import training
    original = training.estimator
    def warned(config):
        model = original(config)
        fit = model.fit
        def fit_with_warning(X, y):
            warnings.warn('Aviso de prueba que debe permanecer visible', UserWarning)
            return fit(X, y)
        model.fit = fit_with_warning
        return model
    monkeypatch.setattr(training, 'estimator', warned)
    text = 'x,category,target\n' + '\n'.join(f'{i},a,{i % 2}' for i in range(40))
    result = train_experiment(text.encode(), base_config)
    assert any('debe permanecer visible' in message for message in result['warnings'])
