"""Controlled audit of current limits; these tests do not endorse them as safe."""
from concurrent.futures import ThreadPoolExecutor
import asyncio
from threading import Event

import pandas as pd
import pytest

from app import main, training, validation
from app.preprocessing import build_preprocessor
from app.schemas import ExperimentConfig
from app.errors import ExecutionError
from conftest import post_csv


def test_actual_csv_row_boundaries():
    assert validation.MAX_ROWS == 100_000
    # Documents that the requested 30,000 ceiling is currently not enforced.
    assert len(validation.read_csv_bytes(b'x\n' + b'1\n' * 30_001)) == 30_001
    assert len(validation.read_csv_bytes(b'x\n' + b'1\n' * 100_000)) == 100_000
    with pytest.raises(validation.DataError, match='100.000'):
        validation.read_csv_bytes(b'x\n' + b'1\n' * 100_001)


def test_actual_column_boundaries(client, base_config):
    assert validation.MAX_COLUMNS == 200
    for count in [101, 200]:
        content = ','.join(f'c{i}' for i in range(count)) + '\n' + ','.join('1' for _ in range(count))
        assert validation.read_csv_bytes(content.encode()).shape == (1, count)
    content = ','.join(f'c{i}' for i in range(201)) + '\n' + ','.join('1' for _ in range(201))
    assert post_csv(client, content, base_config).status_code == 422


def test_row_limit_http(client, base_config):
    assert post_csv(client, 'x,category,target\n' + '1,a,0\n' * 100_001, base_config).status_code == 422


def categorical_config(count):
    names = [f'c{i}' for i in range(count)]
    return ExperimentConfig(target='target', predictors=names,
                            roles={name: 'Categórica nominal' for name in [*names, 'target']},
                            task='classification', model='decision_tree_classifier')


def test_encoded_feature_limit_is_10000_not_2000():
    assert validation.MAX_ENCODED_FEATURES == 10_000
    config = categorical_config(3)
    frame = pd.DataFrame({name: [f'v{i}' for i in range(700)] for name in config.predictors})
    preprocessor, _ = build_preprocessor(frame, config)
    assert preprocessor.fit_transform(frame).shape[1] == 2100
    config = categorical_config(6)
    frame = pd.DataFrame({name: [f'v{i}' for i in range(1666)] for name in config.predictors})
    with pytest.raises(validation.DataError, match='10.000'):
        build_preprocessor(frame, config)


def test_encoded_feature_limit_http(client):
    config = categorical_config(6)
    text = ','.join([*config.predictors, 'target']) + '\n'
    text += '\n'.join(','.join([f'v{i}'] * 6 + [str(i % 2)]) for i in range(2200))
    response = post_csv(client, text, config)
    assert response.status_code == 422
    assert '10.000' in response.json()['detail']


def test_library_value_error_text_is_not_exposed(base_config, monkeypatch):
    def fail_fit(*args, **kwargs):
        raise ValueError('library-internal-detail-marker')

    monkeypatch.setattr(training.Pipeline, 'fit', fail_fit)
    text = 'x,category,target\n' + '\n'.join(f'{i},a,{i % 2}' for i in range(20))
    with pytest.raises(validation.DataError) as error:
        training.train_experiment(text.encode(), base_config)
    assert 'library-internal-detail-marker' not in str(error.value)


@pytest.mark.parametrize('model', ['random_forest_classifier', 'random_forest_regressor'])
def test_random_forest_resource_parameters(base_config, model):
    base_config.model = model
    params = training.estimator(base_config).get_params()
    assert params['n_estimators'] == 100
    assert params['n_jobs'] == 1
    assert params['max_depth'] == 12
    assert params['max_leaf_nodes'] == 256


def test_concurrent_request_rejected_and_health_available(client, base_config, monkeypatch):
    entered, release = Event(), Event()

    async def controlled_training(*args):
        entered.set()
        assert await asyncio.to_thread(release.wait, 5), 'Test failed to release mock training'
        return {'mock': True}

    monkeypatch.setattr(main, 'run_training', controlled_training)
    with ThreadPoolExecutor(max_workers=1) as executor:
        first = executor.submit(post_csv, client, 'x,category,target\n1,a,0', base_config)
        try:
            assert entered.wait(5)
            rejected = post_csv(client, 'x,category,target\n1,a,0', base_config)
            assert rejected.status_code == 429
            assert client.get('/health').status_code == 200
        finally:
            release.set()
        assert first.result(timeout=5).status_code == 200
    assert not main.training_lock.locked()


@pytest.mark.parametrize('error,status', [
    (RuntimeError('private-path-and-stack-secret'), 500),
    (ExecutionError(422, 'Controlled data error'), 422),
])
def test_error_responses_and_lock_release(client, base_config, monkeypatch, error, status):
    async def fail(*args):
        raise error

    monkeypatch.setattr(main, 'run_training', fail)
    response = post_csv(client, 'x,category,target\n1,a,0', base_config)
    assert response.status_code == status
    assert 'Traceback' not in response.text
    assert 'private-path-and-stack-secret' not in response.text
    assert not main.training_lock.locked()


@pytest.mark.parametrize('content', [b'', b'x,x\n1,2', b'x,y\n1', b'x\n"unterminated', b'x\n\xff', b'x\n\x00'])
def test_malformed_csv_http(client, base_config, content):
    response = client.post('/api/experiments', files={'file': ('bad.csv', content, 'text/csv')},
                           data={'config': base_config.model_dump_json()})
    assert response.status_code == 422
    assert 'Traceback' not in response.text
