"""Bounded ephemeral disk sessions. Tokens are bearer secrets, never file paths."""
import hashlib
import os
import re
import secrets
import shutil
from tempfile import TemporaryDirectory
import time
import sys
from pathlib import Path
import tempfile

from . import config
from .errors import ExecutionError


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(64 * 1024):
            result.update(chunk)
    return result.hexdigest()


class SessionStore:
    def __init__(self):
        self._temporary = TemporaryDirectory(prefix='ml-comparisons-')
        self.root = Path(self._temporary.name)
        (self.root / 'owner.pid').write_text(str(os.getpid()), encoding='ascii')
        self.entries = {}
        self.cleanup()

    def remove(self, token):
        entry = self.entries.pop(token, None)
        if entry:
            shutil.rmtree(entry['directory'], ignore_errors=True)

    def cleanup(self):
        for token, entry in list(self.entries.items()):
            if not entry['active'] and time.time() >= entry['expires']:
                self.remove(token)
        # Linux/Render: discard roots abandoned by a dead API after a crash.
        # Only roots with our owner marker are eligible, never arbitrary temp files.
        if sys.platform.startswith('linux'):
            for root in Path(tempfile.gettempdir()).glob('ml-comparisons-*'):
                if root == self.root or not root.is_dir() or root.is_symlink():
                    continue
                try:
                    pid = int((root / 'owner.pid').read_text(encoding='ascii'))
                    if pid > 0 and not Path(f'/proc/{pid}').exists():
                        shutil.rmtree(root)
                except (OSError, ValueError):
                    continue

    def check_budget(self):
        total = sum(path.stat().st_size for path in self.root.rglob('*') if path.is_file())
        if total > config.SESSION_DISK_BYTES:
            raise ExecutionError(503, 'Se ha alcanzado el presupuesto temporal de sesiones. Espera a su caducidad.')

    def create(self):
        self.cleanup()
        self.check_budget()
        if len(self.entries) >= config.MAX_SESSIONS:
            raise ExecutionError(429, 'Hay demasiadas comparaciones temporales. Espera a que caduquen.')
        token = secrets.token_hex(32)
        directory = self.root / secrets.token_hex(16)
        directory.mkdir(mode=0o700)
        self.entries[token] = {'directory': directory, 'expires': time.time() + config.SESSION_TTL_SECONDS, 'active': True, 'used': False}
        return token, directory

    def get(self, token):
        self.cleanup()
        if not re.fullmatch(r'[0-9a-f]{64}', token) or token not in self.entries:
            raise ExecutionError(410, 'La comparación ha caducado o la instancia se ha reiniciado. Ejecuta una nueva CV.')
        return self.entries[token], self.entries[token]['directory']


sessions = SessionStore()
