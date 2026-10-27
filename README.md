# ML Workbench · v0.2

Aplicación para explorar datasets CSV localmente. React, TypeScript estricto, Vite, Tailwind CSS y Recharts. No requiere cuentas, APIs, base de datos ni backend. No se envían archivos a ningún servidor y no se guardan en almacenamiento persistente: al recargar la página se descartan.

## Estructura

```text
frontend/
  src/
    components/   # Carga, métricas, tabla paginada y perfil gráfico
    lib/          # Parsing y detección básica de tipos
    types/        # Contratos de datos
backend/          # Reservado para FastAPI en versiones futuras
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

## Uso y límites

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

## Desplegar en Vercel

1. Sube este monorepositorio a tu proveedor Git e impórtalo en Vercel.
2. Selecciona `frontend` como **Root Directory** y **Vite** como preset.
3. Usa `npm run build` como Build Command y `dist` como Output Directory. Conserva la instalación automática de npm y el acceso a los archivos de la raíz del monorepositorio para el lockfile/workspaces.
4. Selecciona Node.js 22 o superior. No se necesitan variables de entorno ni funciones serverless.

No hay rutas del servidor que requieran rewrites. El backend de FastAPI y su despliegue en Render quedan para futuras fases, junto con entrenamiento y comparación de modelos. No se ha desplegado esta versión automáticamente.
