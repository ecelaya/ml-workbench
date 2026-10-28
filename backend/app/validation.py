import csv
import io
import math
import re
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from .schemas import ExperimentConfig

MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 100_000
MAX_COLUMNS = 200
MAX_CLASSES = 100
MAX_CATEGORIES = 2000
MAX_ENCODED_FEATURES = 10_000
NUMBER = re.compile(r'^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$', re.I)


class DataError(ValueError):
    """Actionable validation failure, safe to return to the user."""


def numeric_series(series: pd.Series, name: str) -> pd.Series:
    valid = series.dropna()
    if not valid.map(lambda value: bool(NUMBER.fullmatch(str(value)))).all():
        raise DataError(f'«{name}» contiene valores no numéricos. Corrige su rol o el archivo.')
    result = pd.to_numeric(series, errors='coerce').astype(float)
    if not np.isfinite(result.dropna()).all() or result.notna().sum() != valid.size:
        raise DataError(f'«{name}» contiene números no finitos o fuera de rango.')
    return result


def read_csv_bytes(content: bytes) -> pd.DataFrame:
    if not content or len(content) > MAX_BYTES:
        raise DataError('El CSV debe tener contenido y no superar 10 MiB.')
    try:
        text = content.decode('utf-8-sig', errors='strict')
        if '\x00' in text:
            raise DataError('El archivo debe ser texto CSV UTF-8 sin bytes nulos.')
        reader = csv.reader(io.StringIO(text, newline=''), strict=True)
        headers = next(reader)
        if not headers or len(headers) > MAX_COLUMNS or any(not h.strip() for h in headers) or len(set(headers)) != len(headers):
            raise DataError('Cabeceras vacías, repetidas o más de 200 columnas.')
        rows = []
        for row in reader:
            if len(row) != len(headers):
                raise DataError(f'La fila {len(rows) + 1} no coincide con la cabecera.')
            if len(rows) >= MAX_ROWS:
                raise DataError('Se supera el límite de 100.000 filas.')
            # Preserve numeric-looking categorical codes and identifiers as text.
            # NA/NULL are literal values, as in the browser's default policy.
            rows.append([np.nan if not cell.strip() else cell for cell in row])
    except (UnicodeError, csv.Error, StopIteration) as exc:
        raise DataError('CSV inválido. Utiliza UTF-8, cabecera y filas regulares.') from exc
    if not rows:
        raise DataError('El dataset no contiene registros.')
    return pd.DataFrame(rows, columns=headers, dtype=object)


@dataclass
class PreparedData:
    X: pd.DataFrame
    y: pd.Series
    excluded_target: int
    warnings: list[str]


def prepare_data(frame: pd.DataFrame, config: ExperimentConfig) -> PreparedData:
    if any(name not in frame for name in [config.target, *config.predictors]):
        raise DataError('El objetivo o algún predictor no existe en el CSV.')
    target = frame[config.target]
    keep = target.notna()
    warnings = []
    X = frame.loc[keep, config.active_predictors()].copy()
    y = target.loc[keep].copy()
    if len(y) < 10:
        raise DataError('Se necesitan al menos 10 registros con objetivo no ausente.')
    if config.task == 'regression':
        y = numeric_series(y, config.target)
    else:
        y = y.astype(str)
        counts = y.value_counts()
        if len(counts) < 2:
            raise DataError('Clasificación requiere al menos dos clases en el objetivo.')
        if len(counts) > MAX_CLASSES:
            raise DataError('El objetivo tiene más de 100 clases. Revisa si es un identificador o una regresión.')
        if config.positive_class is not None and (len(counts) != 2 or config.positive_class not in counts.index):
            raise DataError('La clase positiva debe ser una de las dos clases observadas del objetivo binario.')
    for name in config.active_predictors():
        if config.roles[name] == 'Numérica':
            X[name] = numeric_series(X[name], name)
        if config.roles[name] == 'Identificador':
            warnings.append(f'Identificador «{name}» incluido por selección explícita; se codifica como categoría.')
    if config.target in ('survived', 'Survived') and any(name in config.active_predictors() for name in ('boat', 'body')):
        warnings.append('boat/body pueden describir hechos posteriores al desenlace. Exclúyelos si el objetivo es predecir supervivencia antes del evento.')
    for name in config.active_predictors():
        tokens = re.sub(r'([a-z])([A-Z])', r'\1_\2', name).lower().split('_')
        if set(tokens) & {'after', 'post', 'posterior', 'outcome', 'discharge', 'death'}:
            warnings.append(f'«{name}» podría contener información del desenlace o posterior al evento. Es una señal orientativa por el nombre, no un bloqueo; revisa su disponibilidad al predecir.')
    return PreparedData(X, y, int((~keep).sum()), warnings)


@dataclass
class DataSplit:
    X_train: pd.DataFrame
    X_test: pd.DataFrame
    y_train: pd.Series
    y_test: pd.Series
    stratified: bool
    warnings: list[str]


def split_data(data: PreparedData, config: ExperimentConfig) -> DataSplit:
    stratified = False
    warnings = list(data.warnings)
    if config.task == 'classification' and config.stratify:
        counts = data.y.value_counts()
        n_test = math.ceil(len(data.y) * config.test_size)
        stratified = counts.min() >= 2 and n_test >= len(counts) and len(data.y) - n_test >= len(counts)
        if not stratified:
            warnings.append('Estratificación no viable con estos tamaños y frecuencias; se usa split aleatorio con la misma semilla, sin reintentos.')
    a, b, c, d = train_test_split(data.X, data.y, test_size=config.test_size, random_state=config.seed, stratify=data.y if stratified else None)
    if config.task == 'classification':
        if c.nunique() < 2:
            raise DataError('El split deja menos de dos clases en entrenamiento. Aumenta los datos, agrupa clases fuera de la app o cambia el split.')
        if set(d) - set(c):
            warnings.append('Hay clases en test no observadas en entrenamiento; se evalúan sin ajustar ni repetir el split.')
    if len(d) < 2:
        raise DataError('El conjunto de test debe contener al menos dos observaciones.')
    return DataSplit(a, b, c, d, stratified, warnings)
