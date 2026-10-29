# Recursos y despliegue inicial en Render Free

En v0.4 el mismo permiso y supervisor protegen también la CV completa y la evaluación final. Las comparaciones guardan temporalmente el CSV y los índices en disco con TTL/cupo, sin persistencia de modelos; véase [COMPARISONS.md](COMPARISONS.md). La supervisión de 60 segundos se aplica a la comparación completa, no se reinicia por fold.

El servidor requiere Python 3.11 o posterior. Los controles están en `app/config.py` y se leen al arrancar; reinicia el servicio tras cambiar variables. Valores no enteros o no positivos impiden arrancar, en lugar de desactivar una protección silenciosamente. No se han ampliado los techos anteriores de CSV, filas, columnas ni características.

En Render, con directorio raíz `backend`, utiliza:

```sh
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 1
```

No utilices `--reload` en producción. Configura `CORS_ORIGINS` con los orígenes HTTPS exactos de Vercel separados por comas. `/health` no adquiere el permiso de entrenamiento.

## Configuración

| Variable de entorno | Valor predeterminado | Control y alcance |
|---|---:|---|
| `ML_MAX_CSV_BYTES` | 10485760 (10 MiB) | Tamaño del CSV, comprobado al copiar por bloques y otra vez en el hijo. |
| `ML_MAX_REQUEST_BYTES` | CSV + 524288 bytes | Cuerpo HTTP completo, incluido multipart, campos y archivos extra. Se comprueba Content-Length y también los bytes recibidos, sin depender de esa cabecera. |
| `ML_MAX_CONFIG_CHARS` | 100000 | Longitud del JSON de configuración del formulario. El parser multipart conserva además sus límites propios. |
| `ML_MAX_RESULT_BYTES` | 4194304 (4 MiB) | Tamaño máximo del JSON del hijo antes de que la API lo lea en memoria. Un resultado excesivo se rechaza con 503. |
| `ML_MAX_ROWS` | 100000 | Registros originales, sin cabecera, antes de excluir targets ausentes. |
| `ML_MAX_COLUMNS` | 200 | Columnas originales y tamaño de listas/diccionarios de configuración asociados. |
| `ML_MAX_INPUT_CELLS` | 2000000 | Filas × columnas originales; se rechaza durante la lectura, antes de construir el DataFrame completo. |
| `ML_MAX_CLASSES` | 100 | Clases distintas del objetivo de clasificación. |
| `ML_MAX_CATEGORIES` | 2000 | Categorías distintas por predictor categórico en train y longitud del orden ordinal explícito. |
| `ML_MAX_ENCODED_FEATURES` | 10000 | Estimación conservadora previa al ajuste: categorías observadas + margen para ausencia en One-Hot; una por variable numérica/ordinal. Puede rechazar casos cuyo tamaño final sería algo menor. |
| `ML_MAX_TRAIN_CELLS` | 2000000 | Filas de train × predictores activos, antes de ajustar transformaciones. |
| `ML_MAX_DENSE_CELLS` | 2000000 | Filas de train × predictores numéricos/ordinales, antes de construir sus matrices densas. |
| `ML_TRAINING_TIMEOUT_SECONDS` | 60 | Tiempo de pared del hijo completo: arranque, importaciones, validación, fit, evaluación y escritura del resultado. No solo fit. |
| `ML_UPLOAD_TIMEOUT_SECONDS` | 60 | Plazo desde la admisión para recibir el cuerpo HTTP. No incluye el entrenamiento. |
| `ML_MEMORY_BUDGET_MIB` | 384 | En Linux, umbral reactivo de RSS conjunta del proceso API y su hijo, muestreada aproximadamente cada 50 ms. No es un límite duro. |
| `ML_FOREST_TREES` | 100 | Árboles de ambos Random Forest. |
| `ML_TREE_MAX_DEPTH` | 12 | Profundidad máxima de árboles individuales y de ambos bosques. |
| `ML_TREE_MAX_LEAVES` | 256 | Hojas máximas por árbol. Puede cambiar las métricas respecto a los árboles antes ilimitados. |
| `ML_LOGISTIC_MAX_ITER` | 1000 | Iteraciones máximas de regresión logística; no sustituye al timeout. |
| `ML_NUMERIC_THREADS` | 1 | Se propaga antes de importar bibliotecas científicas a OMP_NUM_THREADS, OPENBLAS_NUM_THREADS, MKL_NUM_THREADS, NUMEXPR_NUM_THREADS, VECLIB_MAXIMUM_THREADS y BLIS_NUM_THREADS. Sobrescribe sus valores heredados. |

Los límites se combinan: cumplir 100000 filas y 200 columnas por separado no permite superar el presupuesto de celdas. Los mínimos metodológicos existentes (10 observaciones utilizables, dos clases y tamaño mínimo de test) se conservan. Las señales de alta cardinalidad por encima de 50 categorías, columnas constantes y posible fuga siguen siendo avisos, no garantías de recursos.

## Admisión y ejecución

`AdmissionMiddleware` adquiere un permiso antes de que FastAPI lea o almacene el multipart. Mientras hay una carga o ejecución admitida, otra petición recibe **429** sin que la aplicación consuma su cuerpo. El servidor HTTP/proxy puede mantener buffers pequeños propios; no se afirma recepción de cero bytes a nivel de red. Los preflights CORS y `/health` siguen disponibles; los errores de admisión también reciben cabeceras CORS.

El permiso combina un mutex y un bloqueo de archivo del SO en el directorio temporal. Se comparte entre procesos de la instancia que usen ese mismo directorio; el archivo no se elimina para evitar carreras entre distintos inodos. **No es un bloqueo distribuido entre réplicas.** Usa un solo worker en Render Free: además del permiso, reduce el consumo base y hace que la medición API+hijo cubra los procesos de aplicación previstos.

El CSV se copia en bloques de 64 KiB a un directorio temporal privado. El parser multipart puede haber usado su propio archivo temporal: existe duplicación temporal en disco, pero la API no crea un `bytes` completo del CSV ni importa NumPy/pandas/scikit-learn. El hijo lee el CSV desde el archivo en streaming, sin una copia adicional completa del texto decodificado; aún acumula las celdas para el DataFrame. Se liberan referencias al frame original y a los datos previos al split antes del fit. Se conserva One-Hot disperso y `n_jobs=1` en estimadores que admiten esa opción.

`execution.py` inicia un intérprete independiente con el mismo Python que FastAPI. No utiliza fork ni depende de heredar el estado del servidor. Al vencer el plazo, exceder la RSS observada o cancelarse la tarea del servidor, **mata y espera al hijo** antes de liberar el permiso. En Linux el hijo configura además SIGKILL al morir su padre. Después se borran los temporales. No existe persistencia de datasets ni modelos. Un abandono del navegador no garantiza cancelar la tarea del servidor: en ese caso sigue protegido por el plazo y la supervisión.

| Situación | HTTP |
|---|---:|
| Otra carga/ejecución admitida | 429 |
| CSV o petición demasiado grande | 413 |
| Carga demasiado lenta | 408 |
| CSV, configuración o complejidad no admitidos | 422 |
| Tiempo máximo del hijo | 504 |
| RSS conjunta observada excesiva | 503 |
| Hijo abortado o resultado inválido | 500 |

Los fallos inesperados y los textos internos de excepciones de bibliotecas no se devuelven al cliente. Los detalles técnicos quedan en los registros del servidor.

## Qué no está garantizado

**No se garantiza operar siempre por debajo de 512 MB ni terminar cada ejemplo en 60 s con 0,1 CPU.** El muestreo RSS puede detectar tarde un pico; el sistema podría matar el servicio antes. No se impone RLIMIT_AS: limita espacio virtual, no RAM conjunta, y puede impedir importar bibliotecas científicas sin representar el uso real. No se administra un cgroup propio desde la aplicación.

La medición `/proc` es específica de Linux y suma RSS de API+hijo (incluye páginas compartidas en ambos). No incluye otros workers, servicios, caché de archivos del contenedor ni todos los costes del SO. Si `/proc` no está disponible, la comprobación RSS no se aplica; tampoco se aplica en Windows. Los límites de entrada, complejidad, hilos, concurrencia y tiempo sí siguen activos. El arranque científico también tiene un coste de RAM y CPU; se paga una vez por entrenamiento a cambio de liberar el proceso completo al finalizar.

La compatibilidad de los seis ejemplos se comprueba localmente con todos sus registros. Las pruebas de extremos usan hijos pequeños y mocks; no se hacen pruebas de estrés contra Render. La ejecución disponible en este checkout se validó con Python 3.12 en Windows; el código usa APIs compatibles con 3.11, pero aquí no se ha ejecutado una matriz Linux/Python 3.11 ni una prueba de capacidad de Render Free.
