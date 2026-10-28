"""Startup-only resource settings, shared by API and isolated worker."""
import os


def positive_int(name: str, default: int) -> int:
    value = int(os.getenv(name, str(default)))
    if value < 1:
        raise ValueError(f'{name} must be a positive integer')
    return value


MAX_BYTES = positive_int('ML_MAX_CSV_BYTES', 10 * 1024 * 1024)
MAX_ROWS = positive_int('ML_MAX_ROWS', 100_000)
MAX_COLUMNS = positive_int('ML_MAX_COLUMNS', 200)
MAX_CLASSES = positive_int('ML_MAX_CLASSES', 100)
MAX_CATEGORIES = positive_int('ML_MAX_CATEGORIES', 2000)
MAX_ENCODED_FEATURES = positive_int('ML_MAX_ENCODED_FEATURES', 10_000)
MAX_CONFIG_CHARS = positive_int('ML_MAX_CONFIG_CHARS', 100_000)
MAX_RESULT_BYTES = positive_int('ML_MAX_RESULT_BYTES', 4 * 1024 * 1024)
MAX_REQUEST_BYTES = positive_int('ML_MAX_REQUEST_BYTES', MAX_BYTES + 512 * 1024)
TRAINING_TIMEOUT_SECONDS = positive_int('ML_TRAINING_TIMEOUT_SECONDS', 60)
UPLOAD_TIMEOUT_SECONDS = positive_int('ML_UPLOAD_TIMEOUT_SECONDS', 60)
MEMORY_BUDGET_MIB = positive_int('ML_MEMORY_BUDGET_MIB', 384)
MAX_INPUT_CELLS = positive_int('ML_MAX_INPUT_CELLS', 2_000_000)
MAX_TRAIN_CELLS = positive_int('ML_MAX_TRAIN_CELLS', 2_000_000)
MAX_DENSE_CELLS = positive_int('ML_MAX_DENSE_CELLS', 2_000_000)
FOREST_TREES = positive_int('ML_FOREST_TREES', 100)
TREE_MAX_DEPTH = positive_int('ML_TREE_MAX_DEPTH', 12)
TREE_MAX_LEAVES = positive_int('ML_TREE_MAX_LEAVES', 256)
LOGISTIC_MAX_ITER = positive_int('ML_LOGISTIC_MAX_ITER', 1000)
NUMERIC_THREADS = positive_int('ML_NUMERIC_THREADS', 1)

# Set before importing NumPy/scikit-learn; propagate to the worker process.
for name in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS',
             'NUMEXPR_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS', 'BLIS_NUM_THREADS'):
    os.environ[name] = str(NUMERIC_THREADS)
