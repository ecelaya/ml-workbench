"""One short-lived interpreter per job; no scientific imports in the API."""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
import time

from . import config
from .errors import ExecutionError


def combined_rss_bytes(pid: int) -> int | None:
    """Linux-only sampled RSS, not a hard/cgroup memory guarantee."""
    if not sys.platform.startswith('linux'):
        return None
    try:
        total = 0
        for process in (os.getpid(), pid):
            for line in Path(f'/proc/{process}/status').read_text().splitlines():
                if line.startswith('VmRSS:'):
                    total += int(line.split()[1]) * 1024
                    break
        return total
    except (OSError, ValueError):
        return None


async def supervise(command: list[str], *, timeout: float, cwd: Path | None = None):
    # Popen also works with Windows event loops used by TestClient.
    process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.DEVNULL,
                               stdout=subprocess.DEVNULL, stderr=None)
    started = time.monotonic()
    try:
        while process.poll() is None:
            if time.monotonic() - started >= timeout:
                raise ExecutionError(504, 'El entrenamiento superó el tiempo máximo y se ha detenido. Prueba con menos datos o un modelo más sencillo.')
            rss = combined_rss_bytes(process.pid)
            if rss is not None and rss > config.MEMORY_BUDGET_MIB * 1024 * 1024:
                raise ExecutionError(503, 'El entrenamiento se ha detenido por consumo de memoria. Reduce los datos o la complejidad del modelo.')
            await asyncio.sleep(.05)
        if process.returncode != 0:
            raise ExecutionError(500, 'El proceso de entrenamiento terminó inesperadamente. Reduce los datos o revisa la configuración.')
    finally:
        if process.poll() is None:
            process.kill()
        # Reap the child before allowing another request or deleting its files.
        await asyncio.to_thread(process.wait)


async def run_training(csv_path: Path, settings, directory: Path):
    config_path, result_path = directory / 'config.json', directory / 'result.json'
    config_path.write_text(settings.model_dump_json(), encoding='utf-8')
    await supervise([sys.executable, '-m', 'app.worker', str(csv_path), str(config_path), str(result_path), str(os.getpid())],
                    timeout=config.TRAINING_TIMEOUT_SECONDS, cwd=Path(__file__).resolve().parents[1])
    try:
        if result_path.stat().st_size > config.MAX_RESULT_BYTES:
            raise ExecutionError(503, 'El resultado supera el tamaño permitido. Reduce los predictores o categorías.')
        payload = json.loads(result_path.read_text(encoding='utf-8'))
        if payload['status'] != 200:
            raise ExecutionError(payload['status'], payload['detail'])
        return payload['result']
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise ExecutionError(500, 'El proceso de entrenamiento no devolvió un resultado válido.') from exc
