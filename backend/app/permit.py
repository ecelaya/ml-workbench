"""Local OS file lock shared by workers in the same instance/filesystem."""
import os
from pathlib import Path
import tempfile
import threading


class InstancePermit:
    def __init__(self):
        self._thread = threading.Lock()
        self._file = None

    def acquire(self, blocking=False):
        if not self._thread.acquire(blocking=blocking):
            return False
        stream = None
        try:
            path = Path(tempfile.gettempdir()) / 'ml-workbench-training.lock'
            stream = path.open('a+b')
            if os.name == 'nt':
                import msvcrt
                if path.stat().st_size == 0:
                    stream.write(b'0')
                    stream.flush()
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self._file = stream
            return True
        except OSError:
            if stream:
                stream.close()
            self._thread.release()
            return False

    def release(self):
        stream = self._file
        try:
            if os.name == 'nt':
                import msvcrt
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
            stream.close()
        finally:
            self._file = None
            self._thread.release()

    def locked(self):
        return self._thread.locked()
