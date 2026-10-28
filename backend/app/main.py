import logging
import os
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from .schemas import ExperimentConfig
from .config import MAX_BYTES, MAX_CONFIG_CHARS
from .admission import AdmissionMiddleware, training_lock
from .errors import ExecutionError
from .execution import run_training

app = FastAPI(title='ML Workbench API', version='0.3.1')
app.add_middleware(AdmissionMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=[
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:5174', 'http://127.0.0.1:5174',
    *[origin.strip() for origin in os.getenv('CORS_ORIGINS', '').split(',')
      if origin.strip() and '*' not in origin],
], allow_credentials=False, allow_methods=['GET', 'POST', 'OPTIONS'], allow_headers=['Content-Type'])


@app.get('/health')
def health():
    return {'status': 'ok', 'version': '0.3.1'}


@app.post('/api/experiments')
async def experiment(file: UploadFile = File(...), config: str = Form(..., max_length=MAX_CONFIG_CHARS)):
    try:
        settings = ExperimentConfig.model_validate_json(config)
    except ValidationError as exc:
        raise HTTPException(422, detail='Configuración inválida: ' + '; '.join(error['msg'] for error in exc.errors())) from exc
    try:
        if not file.filename or not file.filename.lower().endswith('.csv'):
            raise HTTPException(422, detail='Se requiere un archivo .csv.')
        with TemporaryDirectory(prefix='ml-workbench-') as temporary:
            directory = Path(temporary)
            path = directory / 'dataset.csv'
            size = 0
            with path.open('wb') as output:
                while chunk := await file.read(64 * 1024):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise HTTPException(413, detail='El CSV supera el tamaño máximo permitido.')
                    await run_in_threadpool(output.write, chunk)
            await file.close()
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
