import asyncio
import csv
import io
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from pydantic import ValidationError

from app import comparison, main
from app.comparison import aggregate, compare_models, rank_models
from app.errors import DataError, ExecutionError
from app.schemas import ComparisonConfig
from app.sessions import sessions, SessionStore
from app import config


@pytest.fixture(autouse=True)
def clear_sessions():
    for token in list(sessions.entries):
        sessions.remove(token)
    yield
    for token in list(sessions.entries):
        sessions.remove(token)


def settings(base_config):
    base_config.positive_class = '1'
    return ComparisonConfig(experiment=base_config, models=['decision_tree_classifier', 'logistic_regression'])


def toy_path(tmp_path):
    path = tmp_path / 'dataset.csv'
    path.write_text('x,category,target\n' + '\n'.join(f'{i},{"a" if i % 2 else "b"},{i % 2}' for i in range(60)), encoding='utf-8')
    return path


def post_comparison(client, path, cfg):
    return client.post('/api/comparisons', files={'file': ('data.csv', path.read_bytes(), 'text/csv')}, data={'config': cfg.model_dump_json()})


def test_same_folds_no_test_access_and_no_preprocessing_leakage(tmp_path, base_config, monkeypatch):
    cfg = settings(base_config)
    path = toy_path(tmp_path)
    path.write_text('x,category,target\n' + '\n'.join(f'{i},unique-{i},{i % 2}' for i in range(60)))
    fitted, evaluated = [], []
    original_prep, original_eval = comparison.build_preprocessor, comparison.evaluate

    def capture_prep(X, config):
        prep, notes = original_prep(X, config)
        fitted.append((X.copy(), prep))
        return prep, notes

    def capture_eval(pipe, X, y, *args, **kwargs):
        evaluated.append(X.index.tolist())
        return original_eval(pipe, X, y, *args, **kwargs)

    monkeypatch.setattr(comparison, 'build_preprocessor', capture_prep)
    monkeypatch.setattr(comparison, 'evaluate', capture_eval)
    first = compare_models(path, cfg, tmp_path)
    reserved = json.loads((tmp_path / 'split.json').read_text())
    assert len(fitted) == 6
    assert evaluated[:3] == evaluated[3:]
    for i, (X, prep) in enumerate(fitted):
        assert set(X.index).isdisjoint(evaluated[i])
        assert set(X.index).isdisjoint(reserved['test'])
        assert set(evaluated[i]).isdisjoint(reserved['test'])
        assert set(X.index) | set(evaluated[i]) == set(reserved['train'])
        numeric = prep.named_transformers_['numeric']
        assert numeric.named_steps['imputer'].statistics_[0] == pytest.approx(X['x'].median())
        assert numeric.named_steps['scaler'].mean_[0] == pytest.approx(X['x'].mean())
        assert set(prep.named_transformers_['categorical'].named_steps['encoder'].categories_[0]) == set(X['category'])
    again = compare_models(path, cfg, tmp_path)
    for a, b in zip(first['models'], again['models']):
        assert a['metrics'] == b['metrics']
    assert first['evaluation_scope'] == 'cross_validation'
    assert first['primary_metric'] == 'roc_auc'


def test_undefined_precision_not_replaced_by_zero(tmp_path, base_config, monkeypatch):
    from sklearn.dummy import DummyClassifier
    cfg = settings(base_config)
    cfg.primary_metric = 'precision_positive'
    monkeypatch.setattr(comparison, 'estimator', lambda config: DummyClassifier(strategy='constant', constant='0'))
    body = compare_models(toy_path(tmp_path), cfg, tmp_path)
    assert body['best_model'] is None
    for result in body['models']:
        assert result['metrics']['precision_positive']['valid_folds'] == 0
        assert result['metrics']['precision_positive']['mean'] is None
        for fold in result['folds']:
            assert fold['metrics']['precision_positive'] is None
            assert 'precision_positive' in fold['undefined_reasons']


def test_ranking_and_partial_undefined_metrics():
    metrics = aggregate([{'metrics': {'rmse': v}} for v in [1., None, 3.]], ['rmse'])
    assert metrics['rmse']['mean'] == 2
    assert metrics['rmse']['std'] == pytest.approx(np.sqrt(2))
    rows = [{'model': str(v), 'metrics': {'rmse': {'mean': v, 'valid_folds': 3}}} for v in [3., 1., 2.]]
    rows.append({'model': 'partial', 'metrics': metrics})
    assert rank_models(rows, 'rmse')[1] == '1.0'
    for row in rows:
        row['metrics']['f1_macro'] = row['metrics']['rmse']
    assert rank_models(rows, 'f1_macro')[1] == '3.0'
    assert rank_models([rows[-1]], 'rmse')[1] is None


def test_schema_and_unviable_folds(tmp_path, base_config):
    cfg = settings(base_config)
    with pytest.raises(ValidationError):
        ComparisonConfig(experiment=base_config, models=cfg.models, folds=5)
    with pytest.raises(ValidationError):
        ComparisonConfig(experiment=base_config, models=['linear_regression', 'linear_regression'])
    path = toy_path(tmp_path)
    cfg.primary_metric = 'rmse'
    with pytest.raises(DataError, match='métrica'):
        compare_models(path, cfg, tmp_path)
    cfg.primary_metric = None
    path.write_text('x,category,target\n' + '\n'.join(f'{i},a,{1 if i == 0 else 0}' for i in range(20)))
    with pytest.raises(DataError, match='CV estratificada|menos de dos clases'):
        compare_models(path, cfg, tmp_path)


def test_api_reserved_test_only_once_and_no_data_substitution(client, tmp_path, base_config):
    response = post_comparison(client, toy_path(tmp_path), settings(base_config))
    assert response.status_code == 200, response.text
    body = response.json()
    token = body['session_token']
    assert len(token) == 64
    assert 'metrics' not in body  # CV aggregates live under candidates, no test metrics.
    forbidden = client.post('/api/comparisons/evaluate', json={'token': token, 'model': 'random_forest_classifier'})
    assert forbidden.status_code == 422
    substitute = client.post('/api/comparisons/evaluate', json={'token': token, 'model': body['best_model'], 'config': {}})
    assert substitute.status_code == 422
    final = client.post('/api/comparisons/evaluate', json={'token': token, 'model': body['best_model']})
    assert final.status_code == 200, final.text
    assert final.json()['evaluation_scope'] == 'test'
    assert final.json()['sizes']['test'] == body['sizes']['test']
    repeat = client.post('/api/comparisons/evaluate', json={'token': token, 'model': body['best_model']})
    assert repeat.status_code == 409


def test_failed_final_is_consumed_and_other_jobs_can_run(client, tmp_path, base_config, monkeypatch):
    real = main.run_job
    response = post_comparison(client, toy_path(tmp_path), settings(base_config))
    assert response.status_code == 200, response.text
    body = response.json()

    async def timeout(*args, **kwargs):
        raise ExecutionError(504, 'Tiempo agotado')

    monkeypatch.setattr(main, 'run_job', timeout)
    assert client.post('/api/comparisons/evaluate', json={'token': body['session_token'], 'model': body['best_model']}).status_code == 504
    assert client.post('/api/comparisons/evaluate', json={'token': body['session_token'], 'model': body['best_model']}).status_code == 409
    failed = post_comparison(client, toy_path(tmp_path), settings(base_config))
    assert failed.status_code == 504
    assert len(sessions.entries) == 1
    assert not main.training_lock.locked()
    monkeypatch.setattr(main, 'run_job', real)


def test_session_expiry_quota_and_unknown_token(client, monkeypatch):
    store = SessionStore()
    monkeypatch.setattr(config, 'MAX_SESSIONS', 1)
    token, directory = store.create()
    store.entries[token]['active'] = False
    with pytest.raises(ExecutionError) as error:
        store.create()
    assert error.value.status == 429
    store.entries[token]['expires'] = 0
    store.cleanup()
    assert not directory.exists()
    with pytest.raises(ExecutionError):
        store.get(token)
    assert client.post('/api/comparisons/evaluate', json={'token': 'a' * 64, 'model': 'linear_regression'}).status_code == 410
    assert client.post('/api/comparisons/evaluate', json={'token': '../invalid', 'model': 'linear_regression'}).status_code == 422


@pytest.mark.parametrize('endpoint', ['/api/comparisons', '/api/comparisons/evaluate'])
def test_comparison_routes_share_admission_permit(client, endpoint):
    assert main.training_lock.acquire()
    try:
        response = client.post(endpoint, content=b'not a valid request body')
        assert response.status_code == 429
        assert client.get('/health').status_code == 200
    finally:
        main.training_lock.release()


def test_session_disk_budget_is_enforced(monkeypatch):
    store = SessionStore()
    token, directory = store.create()
    (directory / 'data.csv').write_bytes(b'abc')
    monkeypatch.setattr(config, 'SESSION_DISK_BYTES', 2)
    with pytest.raises(ExecutionError) as error:
        store.check_budget()
    assert error.value.status == 503
    store.remove(token)
    assert not directory.exists()


def test_reserved_data_hash_detects_change(client, tmp_path, base_config):
    body = post_comparison(client, toy_path(tmp_path), settings(base_config)).json()
    _, directory = sessions.get(body['session_token'])
    (directory / 'dataset.csv').write_text('changed')
    assert client.post('/api/comparisons/evaluate', json={'token': body['session_token'], 'model': body['best_model']}).status_code == 409


@pytest.mark.parametrize('filename,target,numeric,excluded,task,rows', [
    ('titanic.csv', 'survived', ['pclass', 'age', 'sibsp', 'parch', 'fare'], ['name', 'ticket', 'cabin', 'boat', 'body', 'home.dest'], 'classification', 1309),
    ('iris.csv', 'species', ['sepal_length_cm', 'sepal_width_cm', 'petal_length_cm', 'petal_width_cm'], [], 'classification', 150),
    ('california-housing.csv', 'MedHouseVal', ['MedInc', 'HouseAge', 'AveRooms', 'AveBedrms', 'Population', 'AveOccup', 'Latitude', 'Longitude'], [], 'regression', 20640),
    ('wine.csv', 'cultivar_type', ['alcohol', 'malic_acid', 'ash', 'alcalinity_of_ash', 'magnesium', 'total_phenols', 'flavanoids', 'nonflavanoid_phenols', 'proanthocyanins', 'color_intensity', 'hue', 'od280_od315', 'proline'], [], 'classification', 178),
    ('breast-cancer-wisconsin-diagnostic.csv', 'diagnosis', [], ['id'], 'classification', 569),
    ('penguins.csv', 'species', ['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g', 'year'], [], 'classification', 344),
])
def test_full_sample_comparisons_including_forest(client, filename, target, numeric, excluded, task, rows):
    from app.schemas import ExperimentConfig
    source = Path(__file__).parents[2] / 'frontend/public/datasets' / filename
    records = list(csv.reader(io.StringIO(source.read_text(encoding='utf-8'))))
    headers, data = records[0], records[1:]
    if filename == 'penguins.csv':
        data = [['' if v == 'NA' else v for v in row] for row in data]
    output = io.StringIO(newline='')
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(data)
    predictors = [h for h in headers if h != target and h not in excluded]
    roles = {h: 'Numérica' if h in numeric or filename.startswith('breast-cancer') and h not in ('id', target) else 'Categórica nominal' for h in headers}
    models = ['linear_regression', 'decision_tree_regressor', 'random_forest_regressor'] if task == 'regression' else ['logistic_regression', 'decision_tree_classifier', 'random_forest_classifier']
    classes = sorted({row[headers.index(target)] for row in data})
    cfg = ExperimentConfig(target=target, predictors=predictors, roles=roles, task=task, model=models[0], positive_class=classes[-1] if task == 'classification' and len(classes) == 2 else None)
    settings = ComparisonConfig(experiment=cfg, models=models)
    response = client.post('/api/comparisons', files={'file': ('dataset.csv', output.getvalue().encode(), 'text/csv')}, data={'config': settings.model_dump_json()})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['sizes']['received'] == rows
    assert body['sizes']['train'] + body['sizes']['test'] == rows
    assert len(body['models']) == 3
    for result in body['models']:
        assert len(result['folds']) == 3
        assert sum(f['validation_n'] for f in result['folds']) == body['sizes']['train']
    expected = 'rmse' if task == 'regression' else 'roc_auc' if len(classes) == 2 else 'f1_macro'
    assert body['primary_metric'] == expected
    final = client.post('/api/comparisons/evaluate', json={'token': body['session_token'], 'model': body['best_model']})
    assert final.status_code == 200, final.text
    assert final.json()['sizes']['test'] == body['sizes']['test']
