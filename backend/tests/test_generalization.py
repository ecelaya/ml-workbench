import json
from pathlib import Path

import numpy as np
import pytest

from app import comparison, main
from app.errors import ExecutionError
from app.schemas import ModelCVConfig, ExperimentConfig
from app.sessions import sessions
from app.training import train_experiment


@pytest.fixture(autouse=True)
def clear_sessions():
    for token in list(sessions.entries):
        sessions.remove(token)
    yield
    for token in list(sessions.entries):
        sessions.remove(token)


def toy(tmp_path):
    path = tmp_path / 'data.csv'
    path.write_text('x,category,target\n' + '\n'.join(f'{i},code-{i},{i % 2}' for i in range(60)))
    return path


def test_cv_train_scores_and_no_leakage(tmp_path, base_config, monkeypatch):
    base_config.positive_class = '1'
    settings = ModelCVConfig(experiment=base_config, models=[base_config.model])
    seen, train_sets = [], []
    build, evaluate, validate = comparison.build_preprocessor, comparison.evaluate, comparison.cross_validate

    def prep(X, config):
        train_sets.append(X.copy())
        return build(X, config)

    def checked_cv(*args, **kwargs):
        assert kwargs['return_train_score'] is True
        assert kwargs['n_jobs'] == 1
        return validate(*args, **kwargs)

    def score(pipe, X, y, *args, **kwargs):
        expected = train_sets[-1]
        fitted = pipe.named_steps['preprocessing']
        assert fitted.named_transformers_['numeric'].named_steps['imputer'].statistics_[0] == pytest.approx(expected['x'].median())
        assert fitted.named_transformers_['numeric'].named_steps['scaler'].mean_[0] == pytest.approx(expected['x'].mean())
        assert set(fitted.named_transformers_['categorical'].named_steps['encoder'].categories_[0]) == set(expected['category'])
        seen.append(set(X.index))
        return evaluate(pipe, X, y, *args, **kwargs)

    monkeypatch.setattr(comparison, 'build_preprocessor', prep)
    monkeypatch.setattr(comparison, 'evaluate', score)
    monkeypatch.setattr(comparison, 'cross_validate', checked_cv)
    first = comparison.compare_models(toy(tmp_path), settings, tmp_path, return_train_score=True)
    reserved = json.loads((tmp_path / 'split.json').read_text())
    assert len(train_sets) == 3 and len(seen) == 6
    for i in range(3):
        valid, train = seen[2*i:2*i+2]
        assert valid.isdisjoint(train)
        assert train == set(train_sets[i].index)
        assert (valid | train) == set(reserved['train'])
        assert (valid | train).isdisjoint(reserved['test'])
    row = first['models'][0]
    for metric, stat in row['train_metrics'].items():
        values = [f['train_metrics'][metric] for f in row['folds'] if f['train_metrics'][metric] is not None]
        assert stat['valid_folds'] == len(values)
        if values:
            assert stat['mean'] == pytest.approx(np.mean(values))
    again = comparison.compare_models(toy(tmp_path), settings, tmp_path, return_train_score=True)
    assert row['train_metrics'] == again['models'][0]['train_metrics']
    assert row['metrics'] == again['models'][0]['metrics']


def test_simple_train_metrics_pipeline_predictions(tmp_path, base_config, monkeypatch):
    from app import training
    from sklearn.metrics import accuracy_score
    evaluations = []
    original = training.evaluate
    def capture(pipe, X, y, *args):
        evaluations.append((set(X.index), accuracy_score(y, pipe.predict(X))))
        return original(pipe, X, y, *args)
    monkeypatch.setattr(training, 'evaluate', capture)
    result = train_experiment(toy(tmp_path), base_config)
    assert set(result['train_metrics']) == set(result['metrics'])
    assert result['train_metrics']['accuracy'] == evaluations[1][1]
    assert result['metrics']['accuracy'] == evaluations[0][1]
    assert evaluations[0][0].isdisjoint(evaluations[1][0])
    assert len(evaluations[1][0]) == result['sizes']['train']
    assert result['sizes']['train'] + result['sizes']['test'] == 60
    assert result['evaluation_scope'] == 'test'


@pytest.mark.parametrize('filename,target,predictors,task', [
    ('iris', 'species', ['sepal_length_cm','sepal_width_cm','petal_length_cm','petal_width_cm'], 'classification'),
    ('titanic', 'survived', ['age','fare','sibsp','parch','sex','embarked'], 'classification'),
    ('california-housing', 'MedHouseVal', ['MedInc','HouseAge','AveRooms','AveBedrms','Population','AveOccup','Latitude','Longitude'], 'regression'),
])
def test_model_cv_full_examples_and_final_once(client, filename, target, predictors, task):
    content = (Path(__file__).parents[2] / 'frontend/public/datasets' / f'{filename}.csv').read_bytes()
    roles = {name: 'Categórica nominal' if name in ('sex', 'embarked') or name == target and task == 'classification' else 'Numérica' for name in [target, *predictors]}
    model = 'logistic_regression' if task == 'classification' else 'linear_regression'
    config = ExperimentConfig(target=target, predictors=predictors, roles=roles, task=task, model=model, positive_class='1' if filename == 'titanic' else None)
    settings = ModelCVConfig(experiment=config, models=[model])
    response = client.post('/api/experiments/cv', files={'file': ('sample.csv', content, 'text/csv')}, data={'config': settings.model_dump_json()})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['evaluation_scope'] == 'cross_validation'
    assert len(result['models']) == 1
    candidate = result['models'][0]
    assert set(candidate['train_metrics']) == set(candidate['metrics'])
    assert len(candidate['folds']) == 3
    final = client.post('/api/comparisons/evaluate', json={'token': result['session_token'], 'model': model})
    assert final.status_code == 200, final.text
    assert final.json()['train_metrics']
    assert final.json()['sizes']['test'] == result['sizes']['test']
    assert client.post('/api/comparisons/evaluate', json={'token': result['session_token'], 'model': model}).status_code == 409


def test_cv_timeout_cleans_session_and_releases_permit(client, tmp_path, base_config, monkeypatch):
    async def timeout(*args, **kwargs):
        raise ExecutionError(504, 'Tiempo máximo superado')
    monkeypatch.setattr(main, 'run_job', timeout)
    settings = ModelCVConfig(experiment=base_config, models=[base_config.model])
    response = client.post('/api/experiments/cv', files={'file': ('data.csv', toy(tmp_path).read_bytes())}, data={'config': settings.model_dump_json()})
    assert response.status_code == 504
    assert not sessions.entries
    assert not main.training_lock.locked()
