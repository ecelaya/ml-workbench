import csv
import io
import json
from pathlib import Path

import pytest

from app.schemas import ExperimentConfig
from app.validation import DataError, MAX_BYTES, read_csv_bytes
from conftest import post_csv


def toy_csv(constant_target=False):
    return 'x,category,target\n' + '\n'.join(f'{i},{"a" if i % 2 else "b"},{"a" if constant_target else i % 2}' for i in range(40))


def test_health_and_cors(client):
    assert client.get('/health').json()['status'] == 'ok'
    good = client.options('/api/experiments', headers={'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'POST'})
    assert good.headers['access-control-allow-origin'] == 'http://localhost:5173'
    bad = client.options('/api/experiments', headers={'Origin': 'https://unrelated.example', 'Access-Control-Request-Method': 'POST'})
    assert 'access-control-allow-origin' not in bad.headers


@pytest.mark.parametrize('model', ['logistic_regression', 'decision_tree_classifier', 'random_forest_classifier'])
def test_classifier_models(client, base_config, model):
    base_config.model = model
    response = post_csv(client, toy_csv(), base_config)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['evaluation_scope'] == 'test'
    assert body['sizes'] == {'received': 40, 'excluded_target': 0, 'usable': 40, 'train': 32, 'test': 8}
    assert sum(map(sum, body['confusion_matrix'])) == 8
    assert all(body['metrics'][key] is not None for key in ['accuracy', 'precision_macro', 'recall_macro', 'f1_macro', 'roc_auc'])


@pytest.mark.parametrize('model', ['linear_regression', 'decision_tree_regressor', 'random_forest_regressor'])
def test_regressor_models(client, base_config, model):
    base_config.task = 'regression'
    base_config.model = model
    response = post_csv(client, toy_csv(), base_config)
    assert response.status_code == 200, response.text
    assert set(response.json()['metrics']) == {'mae', 'rmse', 'r2'}


def test_single_class_target_and_no_rows_fail(client, base_config):
    assert post_csv(client, toy_csv(True), base_config).status_code == 422
    assert post_csv(client, 'x,category,target\n', base_config).status_code == 422


def test_invalid_config_and_file_validation(client, base_config):
    config = base_config.model_dump()
    config['predictors'] = ['target']
    response = client.post('/api/experiments', files={'file': ('a.csv', toy_csv(), 'text/csv')}, data={'config': json.dumps(config)})
    assert response.status_code == 422
    assert client.post('/api/experiments', files={'file': ('a.csv', toy_csv())}, data={'config': '{}'}).status_code == 422
    assert client.post('/api/experiments', files={'file': ('a.txt', toy_csv())}, data={'config': base_config.model_dump_json()}).status_code == 422
    assert post_csv(client, 'x,x,target\n1,2,a', base_config).status_code == 422
    assert post_csv(client, 'x,category,target\n1,2', base_config).status_code == 422
    assert client.post('/api/experiments', files={'file': ('a.csv', b'x' * (MAX_BYTES + 1))}, data={'config': base_config.model_dump_json()}).status_code == 413


def test_constant_regression_target_has_no_fake_r2(client, base_config):
    base_config.task = 'regression'; base_config.model = 'linear_regression'
    text = 'x,category,target\n' + '\n'.join(f'{i},a,5' for i in range(20))
    response = post_csv(client, text, base_config)
    assert response.status_code == 200
    assert response.json()['metrics']['r2'] is None


def test_evaluation_failure_and_identifier_selection_are_clear(client, base_config):
    base_config.roles['category'] = 'Identificador'
    response = post_csv(client, toy_csv(), base_config)
    assert response.status_code == 200
    assert any('selección explícita' in message for message in response.json()['warnings'])


def test_literal_na_is_not_missing_and_utf8_validation():
    assert read_csv_bytes(b'x,target\nNA,1').loc[0, 'x'] == 'NA'
    with pytest.raises(DataError): read_csv_bytes(b'\xff')


@pytest.mark.parametrize('filename,target,numeric,excluded,task,rows', [
    ('titanic.csv', 'survived', ['pclass', 'age', 'sibsp', 'parch', 'fare'], ['name', 'ticket', 'cabin', 'boat', 'body', 'home.dest'], 'classification', 1309),
    ('iris.csv', 'species', ['sepal_length_cm', 'sepal_width_cm', 'petal_length_cm', 'petal_width_cm'], [], 'classification', 150),
    ('california-housing.csv', 'MedHouseVal', ['MedInc', 'HouseAge', 'AveRooms', 'AveBedrms', 'Population', 'AveOccup', 'Latitude', 'Longitude'], [], 'regression', 20640),
    ('wine.csv', 'cultivar_type', ['alcohol', 'malic_acid', 'ash', 'alcalinity_of_ash', 'magnesium', 'total_phenols', 'flavanoids', 'nonflavanoid_phenols', 'proanthocyanins', 'color_intensity', 'hue', 'od280_od315', 'proline'], [], 'classification', 178),
    ('breast-cancer-wisconsin-diagnostic.csv', 'diagnosis', [], ['id'], 'classification', 569),
    ('penguins.csv', 'species', ['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g', 'year'], [], 'classification', 344),
])
def test_six_complete_examples(client, filename, target, numeric, excluded, task, rows):
    path = Path(__file__).parents[2] / 'frontend' / 'public' / 'datasets' / filename
    source = list(csv.reader(io.StringIO(path.read_text(encoding='utf-8'))))
    headers, data = source[0], source[1:]
    # Browser normalizes only explicitly configured Penguin NA tokens.
    if filename == 'penguins.csv': data = [['' if v == 'NA' else v for v in row] for row in data]
    output = io.StringIO(newline=''); writer = csv.writer(output); writer.writerow(headers); writer.writerows(data)
    predictors = [name for name in headers if name != target and name not in excluded]
    roles = {name: 'Numérica' if name in numeric or filename.startswith('breast-cancer') and name not in ('id', target) else 'Categórica nominal' for name in headers}
    if 'pclass' in headers: roles['pclass'] = 'Categórica ordinal'
    config = ExperimentConfig(target=target, predictors=predictors, roles=roles, task=task, model='decision_tree_regressor' if task == 'regression' else 'logistic_regression')
    response = post_csv(client, output.getvalue(), config)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['sizes']['received'] == rows
    assert result['sizes']['train'] + result['sizes']['test'] == result['sizes']['usable'] == rows
    assert result['task_type'] == ('regression' if task == 'regression' else 'binary' if filename in ('titanic.csv', 'breast-cancer-wisconsin-diagnostic.csv') else 'multiclass')
    assert result['config']['target'] not in result['config']['predictors']
