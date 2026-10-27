import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import ExperimentConfig


@pytest.fixture
def client():
    with TestClient(app) as instance:
        yield instance


@pytest.fixture
def base_config():
    return ExperimentConfig(target='target', predictors=['x', 'category'], roles={'target': 'Categórica nominal', 'x': 'Numérica', 'category': 'Categórica nominal'}, task='classification', model='decision_tree_classifier')


def post_csv(client, text, config):
    return client.post('/api/experiments', files={'file': ('dataset.csv', text.encode('utf-8'), 'text/csv')}, data={'config': config.model_dump_json()})
