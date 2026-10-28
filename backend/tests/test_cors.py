import importlib

from fastapi.testclient import TestClient

import app.main as main


def test_vercel_preflight_and_restricted_origins(monkeypatch):
    preview = 'https://ml-workbench-preview.vercel.app'
    try:
        with monkeypatch.context() as env:
            env.setenv('CORS_ORIGINS', f' , {preview} , ,https://ml-workbench.vercel.app, * ,')
            configured = importlib.reload(main)
            with TestClient(configured.app) as client:
                for origin in [preview, 'https://ml-workbench.vercel.app',
                               'http://localhost:5173', 'http://127.0.0.1:5173']:
                    response = client.options('/api/experiments', headers={
                        'Origin': origin,
                        'Access-Control-Request-Method': 'POST',
                        'Access-Control-Request-Headers': 'content-type',
                    })
                    assert response.status_code == 200
                    assert response.headers['access-control-allow-origin'] == origin
                    assert 'access-control-allow-credentials' not in response.headers
                    assert set(response.headers['access-control-allow-methods'].split(', ')) == {'GET', 'POST', 'OPTIONS'}
                    assert 'content-type' in response.headers['access-control-allow-headers'].lower()

                rejected = client.options('/api/experiments', headers={
                    'Origin': 'https://unauthorized.vercel.app',
                    'Access-Control-Request-Method': 'POST',
                })
                assert rejected.status_code == 400
                assert 'access-control-allow-origin' not in rejected.headers
    finally:
        # Restore startup configuration for other tests after restoring the environment.
        importlib.reload(main)
