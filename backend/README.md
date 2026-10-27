# ML Workbench API · v0.3

Backend sin estado para un experimento supervisado por petición. El EDA continúa en el navegador. **Solo al pulsar Entrenar** se envía el dataset completo y la configuración a `/api/experiments`.

## Windows y VS Code

Requisitos: Python 3.12 (64 bits, recomendado; dependencias probadas en 3.12) y Node.js 22.12+ para el frontend. Instala Python desde su distribución oficial si `py` o `python` no existen en tu PATH.

En una terminal PowerShell de VS Code, desde la raíz:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Si la política de PowerShell bloquea `Activate.ps1`, no necesitas cambiarla. Ejecuta directamente el intérprete del entorno:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Para instalar solo las dependencias de ejecución usa `requirements.txt`. En VS Code selecciona **Python: Select Interpreter** → `backend/.venv/Scripts/python.exe`. `.venv/` se ignora en Git. Si el agente ha preparado un runtime portátil en `.tools/` para validar, también queda fuera de Git: el proyecto no depende de esa ruta ni de su instalación.

En otra terminal, desde la raíz:

```powershell
Copy-Item frontend/.env.example frontend/.env.local
npm.cmd install
npm.cmd run dev
```

`frontend/.env.local` debe contener:

```dotenv
VITE_API_URL=http://127.0.0.1:8000
```

Vite lee esa variable al iniciar o compilar. Reinícialo tras modificarla. Sin la variable, Modelos muestra instrucciones y deshabilita el envío; el EDA y el build para Vercel siguen funcionando. No hay URL local de respaldo en el código de producción. Con la URL configurada pero FastAPI detenido, el intento de entrenamiento muestra un error de conexión recuperable.

API: http://127.0.0.1:8000/health. Documentación interactiva: http://127.0.0.1:8000/docs. CORS está limitado a `http://localhost:5173`, `http://127.0.0.1:5173` y los equivalentes con puerto 5174, sin credenciales ni comodines. Si Vite elige otro puerto, usa uno de estos o añade explícitamente el origen necesario en `app/main.py`. El MVP está configurado para desarrollo local. Un backend remoto para Vercel necesitará HTTPS y sus orígenes explícitos; no se ha desplegado ni abierto CORS globalmente.

En Linux/macOS: `python3.12 -m venv .venv`, `source .venv/bin/activate`, y los mismos comandos `python -m pip ...` y `python -m uvicorn ...`.

## Módulos y contrato

```text
app/main.py           # FastAPI, CORS, tamaño de archivo, errores y concurrencia
app/schemas.py        # Configuración Pydantic y compatibilidad tarea/modelo
app/validation.py     # CSV, tipos por rol, objetivos válidos y split
app/preprocessing.py  # Construcción de ColumnTransformer (sin fit)
app/training.py       # Estimadores y Pipeline.fit exclusivamente con train
app/evaluation.py     # Predicciones y métricas exclusivamente sobre test
tests/                # API, seis ejemplos completos y controles de fuga
```

`POST /api/experiments` recibe `multipart/form-data` con `file` (CSV UTF-8 de separador coma) y `config` (JSON). El frontend serializa **todas las filas procesadas**, no una página ni una muestra de un gráfico, con Papa Parse, conservando las cadenas originales y escapando comillas/saltos de línea. Los `NA` de Penguins ya se han normalizado por la configuración explícita de carga del ejemplo; `NA`/`NULL` de archivos propios permanecen como texto. El backend lee inicialmente cadenas para no perder ceros a la izquierda ni convertir códigos categóricos en medidas; convierte a número solo las columnas de rol numérico y el objetivo de regresión.

Campos principales del JSON (el frontend los construye sin intervención manual):

```json
{
  "target": "species",
  "predictors": ["bill_length_mm", "island"],
  "roles": {"species": "Categórica nominal", "bill_length_mm": "Numérica", "island": "Categórica nominal"},
  "task": "classification",
  "model": "logistic_regression",
  "test_size": 0.2,
  "seed": 42,
  "stratify": true,
  "preprocessing": {"numeric_imputation": "median", "scaling": "standard", "categorical_imputation": "most_frequent"}
}
```

Identificadores: excluidos inicialmente; el usuario puede seleccionarlos explícitamente y se codifican como categorías. Nominales y ordinales utilizan OneHotEncoder, sin imponer distancias ordinales. El objetivo nunca puede ser predictor. Para Titanic completo se sugieren excluir `boat` y `body` por ser posteriores al desenlace, además de revisar IDs y códigos de alta cardinalidad. La API no puede detectar por sí sola toda fuga semántica o temporal.

## Ejecución y rigor

1. Validar esquema y CSV: máximo 10 MiB, 100000 filas, 200 columnas y cabeceras únicas. Ausente = vacío o solo espacios. No se descartan silenciosamente targets no numéricos de regresión: se informa del error.
2. Excluir únicamente filas con target ausente, informar de su número y exigir al menos 10 observaciones válidas. Clasificación exige 2–100 clases.
3. Hacer un único split con semilla, 10–40 % de test (20 % por defecto). El tamaño de test es `ceil(n * test_size)`. Se estratifica cuando cada clase tiene al menos dos ejemplos y ambos subconjuntos tienen capacidad para las clases. Si no es viable se avisa y se usa split aleatorio sin reintentos. Si train pierde las clases necesarias se rechaza la ejecución; no se busca una semilla con mejor resultado.
4. Construir ColumnTransformer y Pipeline y hacer `fit(X_train, y_train)`. Imputación numérica media/mediana, StandardScaler/MinMaxScaler/ninguno, imputación categórica moda/constante y OneHotEncoder con `handle_unknown='ignore'` y salida dispersa. Las columnas vacías en train se conservan (`keep_empty_features=True`), usando respaldo 0 en numéricas y categoría de ausencia en categóricas. El modo constante usa `__ML_WORKBENCH_MISSING__`. Se avisa de constantes y alta cardinalidad. Límites evaluados **solo con train**: 2000 categorías por predictor y 10000 columnas codificadas estimadas. No se agrupan clases ni se normalizan usando test.
5. Modelos: LogisticRegression (max_iter=1000), DecisionTreeClassifier, RandomForestClassifier (100 árboles); LinearRegression, DecisionTreeRegressor, RandomForestRegressor (100 árboles). Se fija random_state cuando existe y `n_jobs=1` en los bosques; otros parámetros conservan valores predeterminados de las versiones fijadas. No hay búsqueda de hiperparámetros ni recomendación por métricas de test.
6. Evaluar test completo: accuracy, precision/recall/F1 macro, confusión y ROC-AUC binario si es definible; MAE, RMSE y R² para regresión. Macro usa la unión de las clases de train y test, con `zero_division=0`; la clase positiva de AUC es la segunda del estimador y se devuelve explícitamente. Objetivo constante en test: R² no definido (`null`, «—» en pantalla), no un valor inventado. El gráfico de regresión dibuja como máximo 500 pares, mientras las métricas usan todo test.

Los resultados devuelven configuración ejecutada, parámetros del estimador, tamaños, si hubo estratificación, duración, métricas de test y avisos. No se muestran métricas de train. Las advertencias de convergencia y fallos de datos se devuelven al frontend. Los errores inesperados generan HTTP 500 y se registran en el proceso, sin fabricar métricas.

## Pruebas

Desde `backend/` con el entorno activo:

```powershell
python -m pytest -q
```

Desde la raíz sin activación:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest -c backend/pytest.ini -q backend/tests
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Las pruebas cubren los seis CSV completos, todos los estimadores, tipos, CORS, formato/tamaño, clase única, target ausente, estratificación inviable, códigos literales, categorías nuevas, columnas vacías/constantes y límites de cardinalidad. Los controles de fuga verifican índices train/test disjuntos y que los imputadores, escaladores y vocabulario del pipeline completo no aprenden de extremos ni categorías presentes solo en test.

Con FastAPI ya iniciado, también puedes ejecutar desde la raíz la validación HTTP del cliente real con los seis ejemplos (usa `parseCsv`, roles inferidos, `experimentForm` y `runExperiment`, no un cuerpo HTTP alternativo):

```powershell
.\node_modules\.bin\tsx.cmd frontend/scripts/validate-ml-api.ts http://127.0.0.1:8000
```

Durante la validación de v0.3 se comprobó ese flujo con todas las filas y la configuración inicial del asistente de cada ejemplo. Es una prueba de integración de datos y HTTP, no una revisión visual del navegador.

## Límites del MVP

No hay persistencia, autenticación, AutoML, cola de trabajos, optimización, inferencia sobre archivos nuevos ni descarga de modelos. Un entrenamiento simultáneo por proceso: otros reciben HTTP 429. La petición espera al entrenamiento; no existe cancelación del proceso remoto. Si cambias de dataset se descarta el resultado anterior y se aborta la espera en el navegador, pero el servidor termina el trabajo y libera memoria. No se conservan DataFrames ni pipelines globales. Los uploads pueden usar almacenamiento temporal del framework, que se cierra al terminar la petición; no se guarda ningún dataset o modelo permanentemente. No se envían datos hasta solicitar entrenamiento. Los datos se convierten a flotantes para modelos numéricos, con los límites de precisión de NumPy/scikit-learn; el CSV y el EDA siguen preservando su representación textual.
