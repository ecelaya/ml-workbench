"""Internal CLI. Only the API creates these paths and configuration files."""
from . import config  # Apply thread limits before scientific imports.

import os
import signal
import sys

# Render/Linux: do not leave a scientific worker alive after the API dies.
if sys.platform.startswith('linux') and __name__ == '__main__':
    import ctypes
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(1, signal.SIGKILL, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), 'Cannot configure worker parent-death signal')
    if os.getppid() != int(sys.argv[4]):
        raise SystemExit(1)

import json
import logging
from pathlib import Path

from .errors import DataError
from .schemas import ExperimentConfig
from .training import train_experiment


def main():
    csv_path, config_path, result_path = map(Path, sys.argv[1:4])
    try:
        settings = ExperimentConfig.model_validate_json(config_path.read_text(encoding='utf-8'))
        payload = {'status': 200, 'result': train_experiment(csv_path, settings)}
    except DataError as exc:
        payload = {'status': 422, 'detail': str(exc)}
    except Exception:
        logging.exception('Isolated training failure')
        payload = {'status': 500, 'detail': 'El entrenamiento falló. Revisa los datos y la configuración.'}
    result_path.write_text(json.dumps(payload, allow_nan=False), encoding='utf-8')


if __name__ == '__main__':
    main()
