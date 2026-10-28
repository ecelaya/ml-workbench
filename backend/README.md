# ML Workbench API · v0.3.1

Backend sin estado para un experimento supervisado por petición. El EDA continúa en el navegador. **Solo al pulsar Entrenar** se envía el dataset completo y la configuración a `/api/experiments`.

## Windows y VS Code

Requisitos: Python 3.12 (64 bits, recomendado; dependencias probadas en 3.12) y Node.js 22.12+ para el frontend. Instala Python desde su distribución oficial si `py` o `python` no existen en tu PATH.

En una terminal PowerShell de VS Code, desde la raíz:

```powershell
cd backend
py -3.11 -m venv .venv
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
4. Construir ColumnTransformer y Pipeline y hacer fit(X_train, y_train). Los valores predeterminados por grupo se pueden sobrescribir en preprocessing.variables por nombre: imputación media/mediana y escalado standard/minmax/none para numéricas; One-Hot o exclusión para nominales; One-Hot, OrdinalEncoder con ordinal_categories explícitas o exclusión para ordinales. No se permite ordinal sobre una nominal sin corregir expresamente su rol. Los predictores excluidos se retiran antes de convertir tipos o ajustar transformaciones. Se mantienen los límites de 2000 categorías por variable y 10000 características estimadas, comprobados solo en train. Las columnas vacías/constantes conservan sus avisos. No se aprende ningún orden de test.
5. Modelos: LogisticRegression (max_iter=1000), DecisionTreeClassifier, RandomForestClassifier (100 árboles); LinearRegression, DecisionTreeRegressor, RandomForestRegressor (100 árboles). Se fija random_state cuando existe y `n_jobs=1` en los bosques; otros parámetros conservan valores predeterminados de las versiones fijadas. No hay búsqueda de hiperparámetros ni recomendación por métricas de test.
6. Evaluar test completo sin redondear: accuracy y precision/recall/F1 macro para clasificación; en binaria también precision/recall/F1 positivos, sensibilidad, especificidad y ROC-AUC con la clase positiva elegida. Las probabilidades se seleccionan por el índice real de esa etiqueta en classes_, no suponiendo que sea 1 o la segunda columna. Se devuelven métricas por clase con support y matrices absolutas/normalizadas por fila calculadas con scikit-learn. Macro usa la unión de clases train/test con zero_division=0; filas sin soporte no tienen un porcentaje real definido. En regresión: MAE, RMSE y R²; objetivo constante en test implica R² null. Los pares para gráficos se seleccionan determinísticamente (máximo 500), incluyen residuo real menos predicción y no se recortan negativos. Los dominios del gráfico provienen de todo test, no de la muestra dibujada.

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

## Revisión metodológica v0.3.1

- El asistente exige elegir explícitamente la clase positiva en binaria. La API acepta positive_class; clientes antiguos que no lo envían reciben una elección lexicográfica documentada y un aviso, nunca una suposición de que 1 es siempre positivo. No se optimizan umbrales con test. Un valor no observado o una clase positiva en multiclase se rechazan.
- target_units es metadato opcional de presentación: no reescala el objetivo. La interfaz muestra accuracy con dos decimales porcentuales y el resto de métricas con cuatro, sin cambiar los valores internos ni la respuesta. Las no definidas/no aplicables se ocultan con sus avisos. Sensibilidad/especificidad se dejan sin definir si test no contiene el estado real correspondiente.
- preprocessing.variables es un diccionario de ajustes por nombre. Ejemplo de ordinalidad explícita: {"severity":{"encoding":"ordinal","ordinal_categories":["low","medium","high"]}} con rol ordinal. Ejemplo numérico: {"age":{"numeric_imputation":"mean","scaling":"none"}}. Excluir: {"name":{"encoding":"exclude"}}. Los campos omitidos heredan el grupo. Configuraciones de variables no seleccionadas no figuran como ejecutadas.
- OneHotEncoder gestiona desconocidos con vector cero. OrdinalEncoder usa -1, fuera del orden configurado, y lo advierte: no es un rango aprendido ni se inserta una categoría nueva. Se exige que el orden explícito contenga todas las categorías válidas de train; la validación no inspecciona test para modificar ese orden. Se aplica primero la imputación ajustada en train. Una constante de ausencia sin rango explícito también se representa con -1 en ordinales.
- pipeline_summary inspecciona los objetos ajustados: seleccionados, utilizados y descartados, imputación real y valor aprendido, encoder, scaler, orden utilizado, desconocidos en test, filas excluidas por target y nombres mediante get_feature_names_out. El recuento se contrasta con n_features_in_ del estimador. training_seconds mide fit del pipeline; duration_seconds incluye el experimento completo. Se devuelven las versiones de las bibliotecas para reproducibilidad.
- Las señales de información posterior al evento son avisos orientativos, no bloqueos por nombre. Los identificadores siguen excluidos por defecto, con selección manual y aviso.
- La matriz se representa como mapa de calor absoluto o por fila real; se pagina por clases si son numerosas, conservando los denominadores de la matriz completa. Las tarjetas resumen ya no necesitan desplazamiento horizontal. Los gráficos de regresión usan dominios comparables y diagonal y=x; los residuos incluyen referencia y=0. Las métricas siguen usando todo test.

### Origen y corrección del aviso de SciPy

La instalación anterior fijaba scikit-learn 1.6.1, cuyo LogisticRegression pasaba iprint a L-BFGS-B; SciPy reciente lo marca como obsoleto junto con disp. No era una opción enviada por la aplicación. Se actualiza a scikit-learn 1.7.2 y se fija SciPy 1.17.1: el [código oficial de LogisticRegression 1.7.2](https://github.com/scikit-learn/scikit-learn/blob/1.7.2/sklearn/linear_model/_logistic.py) utiliza el helper de compatibilidad para estas opciones. La prueba ejecuta realmente L-BFGS-B y comprueba que no emite disp/iprint; otra prueba inyecta un aviso y exige que permanezca visible. No se añade ningún filtro indiscriminado ni se modifica site-packages.

Tras cambiar requirements, reinstala las dependencias y reinicia Uvicorn. Frontend y backend deben ser v0.3.1; el cliente detecta una API anterior y pide actualizar, en lugar de mostrar una respuesta incompatible.

### Entorno de validación

El backend/.venv encontrado en esta revisión referencia un Python 3.11 que ya no existe. No se ha borrado ni sobrescrito. Las pruebas se han ejecutado con un entorno aislado ignorado por Git en .tools/ml-v031, basado en Python 3.12. Para restaurar tu entorno habitual, crea uno nuevo con un Python instalado (por ejemplo, py -3.12 -m venv .venv-v031 desde backend), instala requirements-dev.txt y selecciona ese intérprete en VS Code. Una venv no se repara modificando solo requirements si falta su intérprete base.

En este checkout puedes usar el entorno aislado ya validado, desde la raíz:

```powershell
.\.tools\ml-v031\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
.\.tools\ml-v031\Scripts\python.exe -m pytest -c backend/pytest.ini -q backend/tests
```

## Límites del MVP

No hay persistencia, autenticación, AutoML, cola de trabajos, optimización, inferencia sobre archivos nuevos ni descarga de modelos. Un entrenamiento simultáneo por proceso: otros reciben HTTP 429. La petición espera al entrenamiento; no existe cancelación del proceso remoto. Si cambias de dataset se descarta el resultado anterior y se aborta la espera en el navegador, pero el servidor termina el trabajo y libera memoria. No se conservan DataFrames ni pipelines globales. Los uploads pueden usar almacenamiento temporal del framework, que se cierra al terminar la petición; no se guarda ningún dataset o modelo permanentemente. No se envían datos hasta solicitar entrenamiento. Los datos se convierten a flotantes para modelos numéricos, con los límites de precisión de NumPy/scikit-learn; el CSV y el EDA siguen preservando su representación textual.
