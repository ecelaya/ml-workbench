# ML Workbench · v0.1

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

El dashboard muestra recuentos reales, tamaño del archivo, valores faltantes y distribución de tipos. En Datos puedes paginar por 10, 25 o 50 filas y desplazar horizontalmente la tabla. Los campos se renderizan como texto, sin interpretar HTML.

Un valor faltante es una cadena vacía o con solo espacios. `NA`, `null` y `NaN` se conservan como texto. La inferencia es básica: una columna es numérica si todos sus valores no vacíos son números finitos con punto decimal (admite notación científica); booleana si son `true`/`false`; fecha si son fechas válidas `AAAA-MM-DD`; en otro caso texto. Una columna vacía queda como «Sin datos». Los únicos se calculan excluyendo vacíos y recortando espacios; los valores originales de la tabla no se modifican. No se infieren formatos de fecha regionales ni números con coma decimal.

## Desplegar en Vercel

1. Sube este monorepositorio a tu proveedor Git e impórtalo en Vercel.
2. Selecciona `frontend` como **Root Directory** y **Vite** como preset.
3. Usa `npm run build` como Build Command y `dist` como Output Directory. Conserva la instalación automática de npm y el acceso a los archivos de la raíz del monorepositorio para el lockfile/workspaces.
4. Selecciona Node.js 22 o superior. No se necesitan variables de entorno ni funciones serverless.

No hay rutas del servidor que requieran rewrites. El backend de FastAPI y su despliegue en Render quedan para futuras fases, junto con entrenamiento y comparación de modelos. No se ha desplegado esta versión automáticamente.
