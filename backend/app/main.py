import logging
import threading

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from .schemas import ExperimentConfig
from .training import train_experiment
from .validation import DataError, MAX_BYTES

app = FastAPI(title='ML Workbench API', version='0.3.0')
app.add_middleware(CORSMiddleware, allow_origins=[
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:5174', 'http://127.0.0.1:5174',
], allow_credentials=False, allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])
training_lock = threading.Lock()


@app.get('/health')
def health():
    return {'status': 'ok', 'version': '0.3.0'}


@app.post('/api/experiments')
async def experiment(file: UploadFile = File(...), config: str = Form(..., max_length=100_000)):
    try:
        settings = ExperimentConfig.model_validate_json(config)
    except ValidationError as exc:
        raise HTTPException(422, detail='Configuración inválida: ' + '; '.join(error['msg'] for error in exc.errors())) from exc
    try:
        if not file.filename or not file.filename.lower().endswith('.csv'):
            raise HTTPException(422, detail='Se requiere un archivo .csv.')
        content = await file.read(MAX_BYTES + 1)
        if len(content) > MAX_BYTES:
            raise HTTPException(413, detail='El CSV supera 10 MiB.')
    finally:
        await file.close()
    if not training_lock.acquire(blocking=False):
        raise HTTPException(429, detail='Ya hay un entrenamiento en curso. Espera a que termine.')
    try:
        return await run_in_threadpool(train_experiment, content, settings)
    except DataError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    except Exception as exc:
        logging.getLogger(__name__).exception('Training failure')
        raise HTTPException(500, detail='El entrenamiento falló en el servidor. Revisa sus registros y la configuración; no se han generado resultados.') from exc
    finally:
        training_lock.release()
