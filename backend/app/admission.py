"""Admission happens before FastAPI parses or spools the multipart body."""
import asyncio
import time

from starlette.responses import JSONResponse
from starlette.formparsers import MultiPartException

from . import config
from .permit import InstancePermit

training_lock = InstancePermit()


class RequestLimit(MultiPartException):
    pass


class AdmissionMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get('path', '').rstrip('/')
        protected = path == '/api/experiments' or path == '/api/comparisons' or path.startswith('/api/comparisons/')
        if scope['type'] != 'http' or scope['method'] != 'POST' or not protected:
            return await self.app(scope, receive, send)
        if not training_lock.acquire(blocking=False):
            return await JSONResponse({'detail': 'Ya hay una carga o entrenamiento en curso. Espera a que termine.'}, status_code=429)(scope, receive, send)
        started = False
        rejection = None
        try:
            headers = dict(scope['headers'])
            try:
                length = int(headers.get(b'content-length', b'0'))
            except ValueError:
                length = 0
            if length > config.MAX_REQUEST_BYTES:
                raise RequestLimit('La petición supera el tamaño máximo permitido.')
            received = 0
            deadline = time.monotonic() + config.UPLOAD_TIMEOUT_SECONDS

            async def limited_receive():
                nonlocal received, rejection
                try:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError()
                    message = await asyncio.wait_for(receive(), remaining)
                except TimeoutError:
                    rejection = 408
                    raise RequestLimit('La carga superó el tiempo máximo permitido.')
                received += len(message.get('body', b''))
                if received > config.MAX_REQUEST_BYTES:
                    rejection = 413
                    raise RequestLimit('La petición supera el tamaño máximo permitido.')
                return message

            async def tracked_send(message):
                nonlocal started
                if message['type'] == 'http.response.start':
                    started = True
                    if rejection is not None:
                        message['status'] = rejection
                await send(message)

            await self.app(scope, limited_receive, tracked_send)
        except RequestLimit as exc:
            if not started:
                await JSONResponse({'detail': exc.message}, status_code=rejection or 413)(scope, receive, send)
        except TimeoutError:
            if not started:
                await JSONResponse({'detail': 'La petición superó el tiempo máximo permitido.'}, status_code=408)(scope, receive, send)
        finally:
            training_lock.release()
