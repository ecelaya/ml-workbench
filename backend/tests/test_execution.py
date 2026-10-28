import asyncio
from pathlib import Path
import subprocess
import sys

import pytest

from app import config, execution, main
from app.admission import AdmissionMiddleware, training_lock
from app.errors import ExecutionError
from app.permit import InstancePermit
from app.preprocessing import build_preprocessor
from app import preprocessing, validation
from conftest import post_csv
import pandas as pd


def test_real_timeout_kills_and_reaps_child_then_recovers(monkeypatch):
    processes = []
    original = subprocess.Popen

    def capture(*args, **kwargs):
        process = original(*args, **kwargs)
        processes.append(process)
        return process

    monkeypatch.setattr(execution.subprocess, 'Popen', capture)
    with pytest.raises(ExecutionError) as error:
        asyncio.run(execution.supervise([sys.executable, '-c', 'import time; time.sleep(30)'], timeout=.2))
    assert error.value.status == 504
    assert processes[0].returncode is not None
    assert processes[0].poll() is not None
    asyncio.run(execution.supervise([sys.executable, '-c', 'pass'], timeout=5))
    assert processes[1].returncode == 0


def test_child_crash_and_memory_termination(monkeypatch):
    with pytest.raises(ExecutionError) as error:
        asyncio.run(execution.supervise([sys.executable, '-c', 'import os; os._exit(7)'], timeout=5))
    assert error.value.status == 500
    monkeypatch.setattr(execution, 'combined_rss_bytes', lambda pid: (config.MEMORY_BUDGET_MIB + 1) * 1024**2)
    with pytest.raises(ExecutionError) as error:
        asyncio.run(execution.supervise([sys.executable, '-c', 'import time; time.sleep(30)'], timeout=5))
    assert error.value.status == 503


@pytest.mark.parametrize('failure,status', [('timeout', 504), ('crash', 500)])
def test_timeout_http_releases_permit_and_temporary_files(client, base_config, monkeypatch, failure, status):
    directories = []

    async def run(path, settings, directory):
        directories.append(directory)
        assert path.exists()
        if len(directories) == 1:
            code = 'import time; time.sleep(30)' if failure == 'timeout' else 'import os; os._exit(7)'
            await execution.supervise([sys.executable, '-c', code], timeout=.5 if failure == 'timeout' else 5)
        return {'mock': True}

    monkeypatch.setattr(main, 'run_training', run)
    assert post_csv(client, 'x,category,target\n1,a,0', base_config).status_code == status
    assert not training_lock.locked()
    assert post_csv(client, 'x,category,target\n1,a,0', base_config).status_code == 200
    assert all(not directory.exists() for directory in directories)


def test_busy_and_oversized_requests_do_not_read_body():
    async def scenario(busy):
        messages = []

        async def forbidden_receive():
            pytest.fail('Rejected request body was consumed')

        async def forbidden_app(*args):
            pytest.fail('Rejected request reached multipart parsing')

        async def send(message):
            messages.append(message)

        scope = {'type': 'http', 'method': 'POST', 'path': '/api/experiments',
                 'headers': [(b'content-length', str(config.MAX_REQUEST_BYTES + 1).encode())]}
        if busy:
            assert training_lock.acquire()
        try:
            await AdmissionMiddleware(forbidden_app)(scope, forbidden_receive, send)
        finally:
            if busy:
                training_lock.release()
        assert messages[0]['status'] == (429 if busy else 413)

    asyncio.run(scenario(True))
    asyncio.run(scenario(False))


def test_streaming_request_limit_without_content_length(client, base_config, monkeypatch):
    monkeypatch.setattr(config, 'MAX_REQUEST_BYTES', 100)
    response = client.post('/api/experiments', content=b'x' * 101,
                           headers={'content-type': 'multipart/form-data; boundary=test'})
    assert response.status_code == 413
    assert not training_lock.locked()


def test_instance_permit_shared_by_independent_objects():
    first, second = InstancePermit(), InstancePermit()
    assert first.acquire()
    try:
        assert not second.acquire()
    finally:
        first.release()
    assert second.acquire()
    second.release()


def test_complexity_checks_before_transform(base_config, monkeypatch):
    frame = pd.DataFrame({'x': [1., 2.], 'category': ['a', 'b']})
    monkeypatch.setattr(preprocessing, 'MAX_TRAIN_CELLS', 3)
    with pytest.raises(validation.DataError, match='celdas'):
        build_preprocessor(frame, base_config)
    monkeypatch.setattr(preprocessing, 'MAX_TRAIN_CELLS', 100)
    monkeypatch.setattr(preprocessing, 'MAX_DENSE_CELLS', 1)
    with pytest.raises(validation.DataError, match='densas'):
        build_preprocessor(frame, base_config)
    monkeypatch.setattr(validation, 'MAX_INPUT_CELLS', 3)
    with pytest.raises(validation.DataError, match='celdas'):
        validation.read_csv_bytes(b'x,y\n1,2\n3,4')


def test_invalid_result_is_generic(tmp_path, base_config, monkeypatch):
    async def invalid(*args, **kwargs):
        (tmp_path / 'result.json').write_text('not json')

    monkeypatch.setattr(execution, 'supervise', invalid)
    with pytest.raises(ExecutionError) as error:
        asyncio.run(execution.run_training(tmp_path / 'data.csv', base_config, tmp_path))
    assert error.value.status == 500


def test_oversized_result_not_loaded(tmp_path, base_config, monkeypatch):
    monkeypatch.setattr(config, 'MAX_RESULT_BYTES', 10)

    async def oversized(*args, **kwargs):
        (tmp_path / 'result.json').write_text('x' * 11)

    monkeypatch.setattr(execution, 'supervise', oversized)
    with pytest.raises(ExecutionError) as error:
        asyncio.run(execution.run_training(tmp_path / 'data.csv', base_config, tmp_path))
    assert error.value.status == 503


def test_busy_response_has_cors_headers(client):
    assert training_lock.acquire()
    try:
        response = client.post('/api/experiments', headers={'Origin': 'http://localhost:5173'})
    finally:
        training_lock.release()
    assert response.status_code == 429
    assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'


def test_configuration_and_lightweight_api_in_fresh_interpreter():
    code = "import app.main, sys, os; from app import config; assert 'sklearn' not in sys.modules; assert 'numpy' not in sys.modules; assert os.environ['OPENBLAS_NUM_THREADS'] == '1'; assert config.TRAINING_TIMEOUT_SECONDS == 60"
    subprocess.run([sys.executable, '-c', code], cwd=Path(__file__).parents[1], check=True, timeout=15)


def test_configuration_environment_and_invalid_values(monkeypatch):
    monkeypatch.setenv('ML_MAX_ROWS', '123')
    monkeypatch.setenv('ML_NUMERIC_THREADS', '2')
    code = "from app import config; import os; assert config.MAX_ROWS == 123; assert os.environ['OMP_NUM_THREADS'] == '2'"
    subprocess.run([sys.executable, '-c', code], cwd=Path(__file__).parents[1], check=True, timeout=15)
    monkeypatch.setenv('ML_MAX_ROWS', '0')
    result = subprocess.run([sys.executable, '-c', 'import app.config'], cwd=Path(__file__).parents[1], capture_output=True, timeout=15)
    assert result.returncode != 0


def test_instance_permit_shared_between_processes():
    assert training_lock.acquire()
    try:
        code = "from app.permit import InstancePermit; assert not InstancePermit().acquire()"
        subprocess.run([sys.executable, '-c', code], cwd=Path(__file__).parents[1], check=True, timeout=15)
    finally:
        training_lock.release()


def test_cancellation_terminates_child(monkeypatch):
    processes = []
    original = subprocess.Popen

    def capture(*args, **kwargs):
        process = original(*args, **kwargs)
        processes.append(process)
        return process

    monkeypatch.setattr(execution.subprocess, 'Popen', capture)

    async def scenario():
        task = asyncio.create_task(execution.supervise([sys.executable, '-c', 'import time; time.sleep(30)'], timeout=10))
        await asyncio.sleep(.1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(scenario())
    assert processes[0].returncode is not None


def test_upload_timeout_releases_permit(monkeypatch):
    monkeypatch.setattr(config, 'UPLOAD_TIMEOUT_SECONDS', .02)

    async def scenario():
        messages = []

        async def slow_receive():
            await asyncio.sleep(.5)
            return {'type': 'http.request', 'body': b'x'}

        async def downstream(scope, receive, send):
            await receive()

        async def send(message):
            messages.append(message)

        await AdmissionMiddleware(downstream)({'type': 'http', 'method': 'POST', 'path': '/api/experiments', 'headers': []}, slow_receive, send)
        assert messages[0]['status'] == 408

    asyncio.run(scenario())
    assert not training_lock.locked()
