class DataError(ValueError):
    """Actionable validation failure, safe to return to the user."""


class ExecutionError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        super().__init__(message)
