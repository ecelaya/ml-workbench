import logging
import os
import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from .schemas import ExperimentConfig, ComparisonConfig
from pydantic import BaseModel, ConfigDict, Field
from .config import MAX_BYTES, MAX_CONFIG_CHARS
from .admission import AdmissionMiddleware, training_lock
from .errors import ExecutionError
from .execution import run_training, run_job
from .sessions import sessions, digest

@asynccontextmanager
async def lifespan(app):
    async def reap():
        while True:
            await asyncio.sleep(30)
            sessions.cleanup()
    task = asyncio.create_task(reap())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title='ML Workbench API', version='0.4.0', lifespan=lifespan)
app.add_middleware(AdmissionMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=[
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:5174', 'http://127.0.0.1:5174',
    *[origin.strip() for origin in os.getenv('CORS_ORIGINS', '').split(',')
      if origin.strip() and '*' not in origin],
], allow_credentials=False, allow_methods=['GET', 'POST', 'OPTIONS'], allow_headers=['Content-Type'])


@app.get('/health')
def health():
    return {'status': 'ok', 'version': '0.4.0'}


async def save_upload(file, path):
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(422, detail='Se requiere un archivo .csv.')
    size = 0
    with path.open('wb') as output:
        while chunk := await file.read(64 * 1024):
            size += len(chunk)
            if size > MAX_BYTES:
                raise HTTPException(413, detail='El CSV supera el tamaño máximo permitido.')
            await run_in_threadpool(output.write, chunk)
    await file.close()


@app.post('/api/experiments')
async def experiment(file: UploadFile = File(...), config: str = Form(..., max_length=MAX_CONFIG_CHARS)):
    try:
        settings = ExperimentConfig.model_validate_json(config)
    except ValidationError as exc:
        raise HTTPException(422, detail='Configuración inválida: ' + '; '.join(error['msg'] for error in exc.errors())) from exc
    try:
        with TemporaryDirectory(prefix='ml-workbench-') as temporary:
            directory = Path(temporary)
            path = directory / 'dataset.csv'
            await save_upload(file, path)
            return await run_training(path, settings, directory)
    except ExecutionError as exc:
        raise HTTPException(exc.status, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logging.getLogger(__name__).exception('Training failure')
        raise HTTPException(500, detail='El entrenamiento falló en el servidor. Revisa los datos y la configuración.') from exc
    finally:
        await file.close()


@app.post('/api/comparisons')
async def comparison(file: UploadFile = File(...), config: str = Form(..., max_length=MAX_CONFIG_CHARS)):
    token = None
    success = False
    try:
        settings = ComparisonConfig.model_validate_json(config)
        token, directory = sessions.create()
        path = directory / 'dataset.csv'
        await save_upload(file, path)
        sessions.check_budget()
        checksum = await run_in_threadpool(digest, path)
        result = await run_job(path, settings, directory, mode='compare')
        sessions.check_budget()
        entry = sessions.entries[token]
        entry.update(active=False, settings=settings, digest=checksum,
                     split_digest=await run_in_threadpool(digest, directory / 'split.json'))
        success = True
        return {**result, 'session_token': token, 'expires_at': entry['expires']}
    except ValidationError as exc:
        raise HTTPException(422, detail='Configuración de comparación inválida.') from exc
    except ExecutionError as exc:
        raise HTTPException(exc.status, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logging.getLogger(__name__).exception('Comparison failure')
        raise HTTPException(500, detail='La comparación falló. Revisa los datos y la configuración.') from exc
    finally:
        await file.close()
        if token and not success:
            sessions.remove(token)


class FinalSelection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    token: str = Field(min_length=64, max_length=64)
    model: str = Field(min_length=1, max_length=64)


@app.post('/api/comparisons/evaluate')
async def final_evaluation(selection: FinalSelection):
    entry = None
    try:
        entry, directory = sessions.get(selection.token)
        if entry['used']:
            raise ExecutionError(409, 'El test de esta comparación ya se ha consultado o intentado evaluar. No se puede repetir.')
        if selection.model not in entry['settings'].models:
            raise ExecutionError(422, 'Elige uno de los candidatos de la comparación.')
        entry['active'] = True
        if await run_in_threadpool(digest, directory / 'dataset.csv') != entry['digest'] or await run_in_threadpool(digest, directory / 'split.json') != entry['split_digest']:
            raise ExecutionError(409, 'Los datos o la partición reservados han cambiado. Inicia una nueva comparación.')
        entry.update(used=True, active=True)
        (directory / 'selection.txt').write_text(selection.model, encoding='utf-8')
        return await run_job(directory / 'dataset.csv', entry['settings'], directory, mode='final')
    except ExecutionError as exc:
        raise HTTPException(exc.status, detail=str(exc)) from exc
    except Exception as exc:
        logging.getLogger(__name__).exception('Final evaluation failure')
        raise HTTPException(500, detail='La evaluación final falló. Inicia una nueva comparación si la sesión ya no está disponible.') from exc
    finally:
        if entry:
            entry['active'] = False
