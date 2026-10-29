# ML Workbench · v0.4.0

**Modelos y generalización:** entrenamiento simple por defecto con métricas de train/test, o CV opcional de tres folds con test reservado y evaluación final explícita. La sección Generalización muestra puntuaciones in-sample frente a test/validación, diferencias absolutas y orientación metodológica sin clasificaciones automáticas de sobreajuste. [Detalles y límites](backend/GENERALIZATION.md).

**Comparaciones:** validación cruzada secuencial de 2–3 modelos sobre train, ranking por una métrica compatible y evaluación final opcional de un único candidato sobre test reservado. Reutiliza el asistente y los gráficos de Modelos. Consulta [el contrato y las decisiones metodológicas](backend/COMPARISONS.md) y [los límites de Render Free](backend/RESOURCES.md). Las sesiones de comparación caducan y se pierden al reiniciar el backend.

Aplicación para explorar datasets CSV localmente. React, TypeScript estricto, Vite, Tailwind CSS y Recharts. El EDA funciona localmente sin backend. La sección Modelos conecta opcionalmente con FastAPI y scikit-learn: solo al pulsar Entrenar se envía el dataset completo al backend configurado. No requiere cuentas ni base de datos y no guarda datasets o modelos permanentemente.

## Estructura

```text
frontend/
  src/
    components/   # Carga, métricas, tabla paginada y perfil gráfico
    lib/          # Parsing y detección básica de tipos
    types/        # Contratos de datos
backend/          # API FastAPI, validación, pipelines y pruebas
```

## Ejecutar

Requiere Node.js 22.12 o superior y npm. Desde la raíz:

```sh
npm install
npm run dev
```

Abre la URL local indicada por Vite (normalmente http://127.0.0.1:5173). En PowerShell con scripts deshabilitados usa `npm.cmd` en lugar de `npm`.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

El build genera `frontend/dist/`. Para instalaciones reproducibles usa `npm ci` con el lockfile incluido.

## Modelos supervisados (v0.3)

La sección **Modelos** contiene un asistente de cuatro pasos: objetivo y predictores, train/test, preprocesamiento y entrenamiento. Permite clasificación binaria/multiclase y regresión con seis estimadores de scikit-learn. Mantiene los roles del EDA, excluye identificadores por defecto, muestra targets ausentes y permite corregir el problema. Para Titanic se excluyen inicialmente boat/body por información posterior al objetivo.

El preprocesamiento se construye con ColumnTransformer y Pipeline: primero se hace el split y luego se ajustan imputadores, codificadores y escaladores exclusivamente con train. Las métricas y gráficos de resultados corresponden a test, sin selección automática de hiperparámetros. Se muestran configuración ejecutada, tamaños reales y avisos. Los cambios de configuración invalidan el resultado mostrado; cambiar de dataset reinicia el asistente.

Para iniciar FastAPI, crear el entorno Python en Windows y conectar Vite mediante **VITE_API_URL**, consulta [backend/README.md](backend/README.md). El archivo [frontend/.env.example](frontend/.env.example) contiene la configuración de desarrollo sin credenciales. No hay dirección local fija de respaldo en el código. Si no configuras la API, el asistente explica cómo hacerlo y mantiene deshabilitado el envío. Si la API está detenida, se informa al intentar entrenar; el EDA local no depende de ella.

El dataset completo se serializa como CSV y la configuración como JSON en una petición multipart, solo al pulsar **Entrenar**. Se mantienen los mismos límites de carga y se verifican de nuevo en el servidor. No se transmiten páginas aisladas ni muestras de visualización. No hay autenticación, persistencia, AutoML, cola de trabajos ni descarga de modelos. Desarrollo local: un entrenamiento simultáneo por proceso. Las instrucciones y pruebas contra fuga de información se detallan en el README del backend.

## Revisión del ML guiado (v0.3.1)

La evaluación muestra accuracy en porcentaje con dos decimales y el resto de métricas con cuatro. Los valores internos conservan su precisión y las tarjetas no aplicables se ocultan. La clase positiva se elige explícitamente en binaria, con métricas positivas, macro, sensibilidad, especificidad y ROC-AUC. Multiclase incorpora métricas por clase y support. La matriz de confusión es un mapa de calor absoluto o normalizado por fila real. Los gráficos de regresión incorporan y=x, escalas comparables, valores negativos y residuos real menos predicción con referencia cero.

El paso 3 conserva los valores predeterminados por grupo y permite ajustes por variable: imputación/escalado numérico, One-Hot o exclusión nominal, One-Hot/ordinal explícito/exclusión ordinal. Se exige confirmar el orden y nunca se aplica ordinal automáticamente a nominales. Todo se sigue ajustando exclusivamente en train. Los resultados incluyen las transformaciones realmente ejecutadas, descartes, características finales y nombres de salida del pipeline.

Se actualiza scikit-learn a 1.7.2 y se fija SciPy 1.17.1 para eliminar el aviso obsoleto de iprint sin ocultar otras advertencias. **Reinstala las dependencias del backend y reinícialo**; el cliente comprueba la versión 0.3.1 del contrato. El README del backend documenta el origen del aviso y el entorno aislado de validación, ya que backend/.venv apunta a un Python del sistema ausente. No se han añadido AutoML, cross-validation ni persistencia.

## Uso y límites

### Datasets de ejemplo

La carga de archivos propios sigue siendo la acción principal. **Explorar dataset de ejemplo** despliega un catálogo de Titanic, Iris, California Housing, Wine, Breast Cancer Wisconsin Diagnostic y Palmer Penguins. Cada ficha muestra descripción, registros, columnas totales, problema, objetivo sugerido, versión y atribución. Un clic carga el CSV estático usando exactamente el mismo `File → parseCsv → análisis` que un archivo propio. Puedes descargar el CSV del ejemplo, cambiar entre ejemplos y archivos personales y corregir los roles manualmente. El nombre del ejemplo activo y su objetivo sugerido aparecen sobre el resumen. Cargar o explorar un ejemplo no entrena modelos automáticamente.

Los archivos completos están en `frontend/public/datasets/`; el catálogo tipado está en `frontend/src/data/sampleDatasets.ts`. Las [fuentes, versiones, licencias, cambios y SHA-256](frontend/public/datasets/SOURCES.md) identifican cada copia. Titanic es OpenML v1 completo (1309 filas), no el train de Kaggle de 891 filas. California Housing es la exportación versionada de scikit-learn de 20640 filas y 9 columnas. El total de columnas incluye el objetivo y, en WDBC, el ID original.

Al cargar correctamente un nuevo dataset se incrementa la revisión del dataset: se reinician roles, orden ordinal, selecciones, gráficos, paginaciones y filtros dependientes del anterior. Si la descarga o validación falla se conserva el dataset anterior. La carga impide operaciones concurrentes. Los ejemplos no modifican el parser ni los cálculos del EDA.

Los CSV se sirven desde el propio frontend, mediante rutas que respetan el `BASE_URL` de Vite. Vercel los copia automáticamente a `dist/datasets/`; no requieren backend, claves ni llamadas a servicios de terceros para cargar y explorar. No se descargan durante el build. Solo se obtiene por HTTP el ejemplo elegido; el parsing y EDA siguen siendo locales. Los archivos personales solo se transmiten al backend configurado al solicitar entrenamiento. Se necesita el servidor local o el host Vercel para servir los assets; no se añade un modo offline ni persistencia.

Las pruebas verifican los seis archivos íntegros, sus huellas y dimensiones, los límites de carga y el flujo real de `parseCsv(File)`, así como recuentos del objetivo y estadísticos sobre todas las filas. Palmer Penguins conserva el CSV oficial de 344 filas y 8 columnas, con objetivo `species` y licencia de datos CC0. Sus 19 marcadores `NA` originales se interpretan como ausencias solo al cargar ese ejemplo, mediante configuración explícita del catálogo; la descarga conserva los marcadores y los archivos propios mantienen la política habitual de `NA` como texto. No se imputan ausencias ni se eliminan filas. Los detalles de reproducción figuran en `SOURCES.md`.

### Archivos propios

Carga o arrastra un `.csv` UTF-8 con una cabecera y al menos una fila. Papa Parse detecta el separador (incluidos coma, punto y coma y tabulador), interpreta comillas, campos con separadores y saltos de línea entrecomillados. Las líneas completamente vacías se ignoran. Se rechazan cabeceras vacías o duplicadas, filas con distinto número de campos y errores de sintaxis; no se muestran resultados parciales. Una carga fallida conserva el dataset previo.

Límites: 10 MiB, 100.000 filas de datos y 200 columnas. Papa Parse lee por fragmentos en un Web Worker; el perfil se calcula sobre todas las filas en el hilo principal. Estos límites acotan el consumo, aunque los datasets densos pueden tardar unos segundos. Se mantiene un solo dataset en memoria. El botón × lo elimina.

El dashboard muestra recuentos reales, tamaño del archivo, valores faltantes y distribución de tipos de almacenamiento. En Datos puedes paginar por 10, 25 o 50 filas y desplazar horizontalmente la tabla. Los campos se renderizan como texto, sin interpretar HTML.

Un valor faltante es una cadena vacía o con solo espacios. `NA`, `null` y `NaN` se conservan como texto. El almacenamiento distingue entero (representación con dígitos y signo opcional), decimal (incluye punto o notación científica), booleano (`true`/`false`), fecha ISO válida (`AAAA-MM-DD`) y texto. Una columna vacía queda como «Sin datos». Los únicos se calculan excluyendo vacíos y recortando espacios; los valores originales de la tabla no se modifican. No se infieren formatos regionales ni números con coma decimal.

## Análisis exploratorio (v0.2)

La pestaña **Análisis exploratorio** separa el almacenamiento del rol: numérica, categórica nominal, categórica ordinal o identificador. Cada columna muestra el motivo de su sugerencia y si requiere revisión. El rol se corrige con un selector sin modificar los valores originales. La vista general muestra el almacenamiento.

La inferencia reutilizable está en `frontend/src/lib/inference.ts` y usa todos los valores no vacíos:

- Tokens de identificación (`id`, `identifier`, `uuid`, `guid`, `identificador`) con separación snake_case, camelCase y acrónimos: `PassengerId` y `passenger_id` se reconocen; `humidity`, `paid` o `valid` no coinciden por subcadenas. Un nombre identificador no garantiza unicidad ni que no haya ausencias.
- UUID observados: al menos tres valores y proporción única ≥95%. Referencias como ticket, booking, código o serial: al menos cinco observaciones, tres valores distintos y proporción única ≥50%; se muestran como **posible identificador**, pues pueden compartirse.
- Booleanos y códigos con ambos estados 0/1: categórica nominal binaria, aunque se almacenen como enteros o decimales. Una constante 0 o 1 no basta para deducir dos estados.
- Ordinalidad: nombre de escala (`level`, `priority`, `tier`, `class`, sus equivalentes españoles o abreviaturas de una letra más `class`) combinado con 2–20 niveles enteros entre 0 y 20, o etiquetas conocidas como bajo/medio/alto. Es orientativo, no prueba el orden. La función también admite metadatos con un rol declarado o una lista de valores ordenados; la interfaz CSV no importa metadatos externos.
- Nombres de categoría, estado, grupo, tipo o código con hasta 20 valores distintos sugieren nominal; nunca se infiere ordinalidad solo por baja cardinalidad.
- Secuencias enteras desde 0 o 1, consecutivas en el orden del archivo, sin repetidos y con al menos 20 valores sugieren **posible índice**. Nombres comunes de medidas o conteos impiden esta regla. La unicidad por sí sola no convierte números o texto libre en identificadores.
- Sin más evidencia, los números siguen como magnitudes (incluidos conteos discretos) y el resto como nominal, con sugerencia orientativa corregible.

La fixture representativa de Titanic verifica PassengerId como identificador, Survived como nominal binaria, Pclass como ordinal, Sex como nominal, Age/Fare/SibSp/Parch como numéricas y Ticket como posible identificador. Las reglas no dependen del dataset. En una muestra donde un conteo solo tenga 0/1, la evidencia observada puede sugerir binaria: revisa y corrige su rol según el contexto.

Solo el rol numérico participa por defecto en descriptivos, histogramas y Pearson. Una casilla permite incluir o excluir explícitamente cada columna. Cambiar un rol restablece la selección de esa variable al valor por defecto. Roles y selecciones permanecen al cambiar de pestaña; se reinician al cargar otro archivo y no se guardan tras recargar la página. Un rol ordinal no asigna automáticamente orden ni distancia a etiquetas como «bajo» y «alto». Los valores no numéricos no se codifican ni convierten a cero.

Los descriptivos incluyen N válido, excluidos, media, desviación estándar y varianza muestrales, mínimo, Q1, mediana, Q3 y máximo. Los cuartiles usan interpolación lineal en la posición `(n − 1) × p`. Se excluyen vacíos y valores no numéricos de cada columna. Una muestra de un solo valor no tiene varianza muestral; los estadísticos indefinidos o que desbordan el rango representable se muestran como «—».

El histograma usa intervalos de igual anchura, hasta 20 (`ceil(sqrt(n))`), abiertos a la derecha salvo el último, que incluye el máximo; una constante ocupa un único intervalo. La distribución de variables excluidas del análisis numérico muestra frecuencias categóricas absolutas, sin vacíos y sin imponer un orden estadístico. Con más de 20 categorías se omite el gráfico y se explica el motivo: no se ocultan categorías ni se agrupan como «otros».

Pearson usa casos completos por pareja, mostrando `r` y `n` en cada celda. No se calcula con menos de dos pares ni con una variable constante, incluida la diagonal de esa variable. La matriz requiere entre 2 y 20 variables seleccionadas. Las inclusiones explícitas de identificadores o códigos categóricos no les otorgan significado cuantitativo: revisa si la comparación tiene sentido. Toda la lógica y los gráficos siguen ejecutándose localmente con las dependencias existentes.

Las pruebas estadísticas cubren nulos, conversiones estrictas, cuartiles, varianza muestral, constantes, muestras insuficientes, correlaciones positivas/negativas/nulas, casos completos por pareja, números grandes, límites del histograma, frecuencias y selección según roles.

## Diagnóstico de ausencias por fila y columna

En **Calidad de datos**, el gráfico por columna utiliza siempre un eje de 0–100 %, muestra el porcentaje sin redondeo adicional en el tooltip y permite alternar entre el orden original del archivo y porcentaje de ausencias descendente. Se muestran 20 columnas por página, sin omitir las restantes.

El diagnóstico por fila utiliza todos los registros procesados que la aplicación conserva en memoria, sin muestreo. Por defecto se consideran todas las columnas, incluidos identificadores. Puedes cambiar la selección sin alterar el diagnóstico por columna ni los datos. Con cero columnas seleccionadas no se calculan porcentajes. La media, mediana y máximo usan el porcentaje de ausencias en la selección; se distinguen filas vacías en todas las columnas originales y filas con 100 % de ausencias solo en la selección.

La distribución usa intervalos excluyentes: 0 %, (0,10], (10,20], (20,40], (40,60], (60,80] y (80,100]. Cada intervalo muestra número de filas y porcentaje sobre todos los registros procesados. El umbral parte de 40 % y aplica «estrictamente mayor», sin redondeo previo. La tabla filtra todos los registros y pagina de 20 en 20. La descarga CSV incluye todas las filas filtradas, todas las columnas originales y su contenido; no incluye las métricas añadidas en pantalla. Se genera localmente con Papa Parse, conservando el separador detectado y escapando comillas y saltos de línea. No se eliminan ni transforman registros.

Solo se consideran ausentes campos vacíos o con espacios, reutilizando `isMissing`; `NA`, `NULL` y `N/A` siguen siendo texto. El lector ya omite líneas completamente vacías, por lo que el diagnóstico se refiere a los registros procesados, no a líneas físicas descartadas durante la lectura. No se necesita relectura del archivo: todos los registros aceptados se almacenan en memoria dentro de los límites de carga.

## Desplegar en Vercel

1. Sube este monorepositorio a tu proveedor Git e impórtalo en Vercel.
2. Selecciona `frontend` como **Root Directory** y **Vite** como preset.
3. Usa `npm run build` como Build Command y `dist` como Output Directory. Conserva la instalación automática de npm y el acceso a los archivos de la raíz del monorepositorio para el lockfile/workspaces.
4. Selecciona Node.js 22 o superior. El EDA no necesita variables de entorno ni funciones serverless. Modelos utiliza VITE_API_URL si se conecta un backend.

No hay rutas del servidor que requieran rewrites. El frontend se puede compilar y desplegar aunque FastAPI no esté disponible. Configura VITE_API_URL en Vercel solo si tienes un backend accesible por HTTPS y añade su origen explícito en CORS del backend. Las instrucciones de desarrollo están en backend/README.md. El despliegue remoto y la comparación persistente de modelos quedan fuera de este MVP. No se ha desplegado automáticamente.
