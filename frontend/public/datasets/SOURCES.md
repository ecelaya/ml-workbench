# ML Workbench — Datos de ejemplo v0.2.2

Revisión y descarga: 2026-10-27. Se distribuyen datos reales completos, no muestras ni datos generados. Los números de columnas incluyen el objetivo y cualquier identificador. Los archivos públicos son los mismos que se ofrecen para descargar en la interfaz. Las cabeceras añadidas no implican modificación de los valores.

| Archivo | Filas | Columnas | Objetivo | Versión concreta |
| --- | ---: | ---: | --- | --- |
| titanic.csv | 1309 | 14 | survived | OpenML 40945, versión 1, file_id 16826755, description_version 10 |
| iris.csv | 150 | 5 | species | UCI 53, miembro iris.data del snapshot descargado el 2026-10-27 |
| california-housing.csv | 20640 | 9 | MedHouseVal | Mendeley hhb6nwfft8, v1, publicada 2026-09-03; archivo 891e5207-9af4-48d6-b52d-1786310ef8a5 |
| wine.csv | 178 | 14 | cultivar_type | UCI 109, miembro wine.data del snapshot descargado el 2026-10-27 |
| breast-cancer-wisconsin-diagnostic.csv | 569 | 32 | diagnosis | UCI 17, miembro wdbc.data del snapshot descargado el 2026-10-27 |

UCI no asigna una versión semántica a esos miembros: se identifican por nombre, fecha y SHA-256. No se presentan como una versión numerada inexistente. Las huellas de los archivos de origen y de los CSV distribuidos figuran al final.

## Fuentes, atribución y condiciones

### Titanic

- Fuente: [OpenML 40945 v1](https://www.openml.org/d/40945), [metadatos originales](https://www.openml.org/api/v1/json/data/40945), [ARFF, file_id 16826755](https://openml.org/data/v1/download/16826755/Titanic.arff).
- Atribución: Frank E. Harrell Jr. y Thomas Cason; Vanderbilt Biostatistics. Las fuentes históricas citadas por OpenML incluyen Encyclopedia Titanica y Eaton & Haas (1994), *Titanic: Triumph and Tragedy*, con lista editada por Michael A. Findlay.
- Condiciones verificadas: el campo `licence` de esta versión dice literalmente `Public`. Esa etiqueta no es una licencia SPDX ni demuestra CC0 o dominio público. Las [condiciones de OpenML](https://www.openml.org/terms) declaran los datos empíricos y metadatos bajo CC-BY y piden respetar las atribuciones particulares. Esta copia conserva la atribución y los enlaces, e identifica los cambios. No se atribuye al dataset la licencia BSD del software de OpenML ni se afirma una versión de CC-BY que la ficha no especifica.
- Cambios: conversión del ARFF a CSV con las mismas 14 columnas y 1309 registros. Los marcadores de ausencia `?` de ARFF se representan como celdas vacías para el lector CSV existente. Se conservan las representaciones numéricas y las etiquetas; no se imputan valores ni se añaden identificadores.
- Objetivo: `survived`, 0 = no sobrevivió, 1 = sobrevivió (809 y 500 registros). No es el train de Kaggle de 891 filas, sino la versión completa titanic3. `pclass` conserva su codificación ordinal. Los campos `boat` y `body` contienen información posterior al desenlace: se conservan por fidelidad a la fuente, pero no son predictores válidos para una evaluación prospectiva de supervivencia. El catálogo no ejecuta entrenamiento.

### Iris

- Fuente oficial: [UCI 53](https://archive.ics.uci.edu/dataset/53/iris), [DOI 10.24432/C56C76](https://doi.org/10.24432/C56C76), [archivo ZIP](https://archive.ics.uci.edu/static/public/53/iris.zip), miembro `iris.data`.
- Atribución: Fisher, R. (1936). *Iris* [Dataset]. UCI Machine Learning Repository.
- Licencia indicada por UCI: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). Permite compartir y adaptar con atribución, enlace a la licencia e indicación de cambios, sin sugerir respaldo del autor. No se añaden restricciones.
- Cambios: solo cabeceras descriptivas `sepal_length_cm`, `sepal_width_cm`, `petal_length_cm`, `petal_width_cm`, `species`. Se conserva `iris.data`, no `bezdekIris.data`; no se aplican las correcciones históricas de muestras 35/38 descritas en la ficha UCI. Las medidas están en cm.
- Objetivo: etiquetas originales Iris-setosa, Iris-versicolor e Iris-virginica; 50 registros por especie.

### California Housing

- Fuente versionada: Deshpande, Vrushali (2026), *California Housing Dataset — Scikit-learn CSV Export*, Mendeley Data, V1, [DOI 10.17632/hhb6nwfft8.1](https://doi.org/10.17632/hhb6nwfft8.1), [ficha y licencia del depósito](https://data.mendeley.com/datasets/hhb6nwfft8/1).
- [Descarga exacta del archivo](https://data.mendeley.com/public-files/datasets/hhb6nwfft8/files/891e5207-9af4-48d6-b52d-1786310ef8a5/file_downloaded). Fecha del archivo: 2026-09-01; publicación del depósito: 2026-09-03. Su SHA-256 coincide con el declarado por la API pública del depósito.
- Atribución de los datos originales: R. Kelley Pace y Ronald Barry, *Sparse Spatial Autoregressions*, Statistics & Probability Letters 33 (1997), pp. 291–297. Procedencia: censo estadounidense de 1990 / StatLib; [descripción de scikit-learn](https://scikit-learn.org/stable/datasets/real_world.html#california-housing-dataset).
- Condiciones de esta distribución: el depósito V1 declara [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Se conserva la atribución del exportador y los autores originales, el enlace a la licencia y esta descripción de procedencia y cambios. Esta declaración corresponde al depósito de datos, no a la licencia del código de scikit-learn.
- Cambios por ML Workbench: **ninguno**, copia byte a byte del CSV publicado, con sus cabeceras originales. La fuente exportó `fetch_california_housing(as_frame=True)` sin modificar después sus observaciones. Esa variante contiene ocho medidas y el objetivo: MedInc, HouseAge, AveRooms, AveBedrms, Population, AveOccup, Latitude, Longitude, MedHouseVal.
- Se contrastaron las 20640 filas con el [archivo StatLib que usa scikit-learn](https://ndownloader.figshare.com/files/5976036), SHA-256 `aaa5c9a6afe2225cc2aed2723682ae403280c4a3695a2ddda4ffb5d8215ea681`. Coinciden con las transformaciones documentadas del cargador: habitaciones y dormitorios / hogares, población / hogares, y valor de vivienda / 100000. No es la variante de Géron con `ocean_proximity` y ausencias añadidas para enseñanza, ni un dataset sintético de Kaggle Playground.
- Objetivo `MedHouseVal`: valor mediano de vivienda por grupo censal, en **100000 USD**. No se deshacen los límites o topes presentes en los datos de origen. No hay ausencias.

### Wine

- Fuente oficial: [UCI 109](https://archive.ics.uci.edu/dataset/109/wine), [DOI 10.24432/C5PC7J](https://doi.org/10.24432/C5PC7J), [archivo ZIP](https://archive.ics.uci.edu/static/public/109/wine.zip), miembro `wine.data`.
- Atribución: Aeberhard, S. & Forina, M. (1992). *Wine* [Dataset]. UCI Machine Learning Repository.
- Licencia indicada por UCI: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), con atribución, enlace a licencia e indicación de cambios, sin sugerir respaldo de los autores.
- Cambios: solo cabeceras descriptivas añadidas según `wine.names`. Se conserva el orden de filas/columnas y todos sus valores, incluida la clase en la primera columna, llamada `cultivar_type`. No se normaliza ni estandariza ninguna variable.
- Objetivo: código de cultivar 1, 2 o 3, nominal y sin orden; 59, 71 y 48 registros. No confundir con Wine Quality, otra colección.

### Breast Cancer Wisconsin Diagnostic (WDBC)

- Fuente oficial: [UCI 17](https://archive.ics.uci.edu/dataset/17/breast-cancer), [DOI 10.24432/C5DW2B](https://doi.org/10.24432/C5DW2B), [archivo ZIP](https://archive.ics.uci.edu/static/public/17/breast+cancer+wisconsin+diagnostic.zip), miembro `wdbc.data`.
- Atribución: William H. Wolberg, W. Nick Street y Olvi L. Mangasarian; cita de UCI: Wolberg, W., Mangasarian, O., Street, N., & Street, W. (1993). *Breast Cancer Wisconsin (Diagnostic)* [Dataset]. UCI Machine Learning Repository. El archivo `wdbc.names` identifica la donación en noviembre de 1995.
- Licencia indicada por UCI: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), con atribución, enlace a licencia e indicación de cambios, sin sugerir respaldo de los autores.
- Cambios: solo cabeceras añadidas. Se mantienen `id`, `diagnosis` y las 30 mediciones, en tres bloques de diez: media (`_mean`), error estándar (`_se`) y peor valor (`_worst`), en el mismo orden del archivo. No se elimina el ID, no se recodifica el objetivo y no se añade un índice artificial.
- Objetivo: `diagnosis`, B = benigno (357), M = maligno (212). Es WDBC Diagnostic, no Wisconsin Original ni Prognostic.

## Huellas de integridad

SHA-256 de los miembros de origen (antes de añadir cabeceras o convertir ARFF):

```text
titanic.arff      c56e3785c96cd8aceac85f11bff21c2bf72841426f50903a6f27be8f334a7d03
iris.data         6f608b71a7317216319b4d27b4d9bc84e6abd734eda7872b71a458569e2656c0
wine.data         6be6b1203f3d51df0b553a70e57b8a723cd405683958204f96d23d7cd6aea659
wdbc.data         d606af411f3e5be8a317a5a8b652b425aaf0ff38ca683d5327ffff94c3695f4a
california_housing.csv 94ef369b909f5c725340b512b7c9a05c1550a554b6592d29303990e3ba521a1f
```

CSV distribuidos (las mismas huellas se verifican en las pruebas):

```text
titanic.csv       98919d5c63fefef712481a38acd0d154887c4d96280af2c834a921ea05d124ee
iris.csv          b9c2c79bfac42185ece47e3c0ac4b646594eccc0cf279546dd336b626ec9e70c
california-housing.csv 94ef369b909f5c725340b512b7c9a05c1550a554b6592d29303990e3ba521a1f
wine.csv          7c7cc9088c05defbb0de77c923ba7e1a16b22acb5c9c73652bb04217751a976d
breast-cancer-wisconsin-diagnostic.csv 1beebcb6fe65e01dc93a1aafd43bee201723dc5bbd2479e5f7ed8c634e788202
```

## Reproducción y validación

Los CSV están versionados con el código y no se descargan ni generan durante el build. No se consulta UCI, OpenML ni Mendeley desde la aplicación en ejecución: solo se solicita el CSV estático al propio host de ML Workbench. Los archivos personales del usuario nunca se envían al servidor.

Para reproducir, descarga los enlaces indicados, extrae los ZIP y coloca `iris/iris.data`, `wine/wine.data`, `breast-cancer/wdbc.data`, `titanic.arff` y `california_housing.csv` en un directorio local. Ejecuta desde la raíz:

```sh
node frontend/scripts/prepare-sample-datasets.mjs RUTA_AL_DIRECTORIO
npm test
npm run typecheck
npm run build
```

El script rechaza fuentes cuya huella no coincida. Las pruebas usan exactamente `parseCsv(File)` para los cinco CSV, verifican dimensiones, tipos de problema por frecuencias de objetivo, ausencias e integridad. Se calculan estadísticas con todas las filas, incluyendo las 20640 de California Housing. Solo se adapta FileReader al ejecutar las pruebas en Node; el parsing, validación y perfiles son los del producto. Los gráficos pueden muestrear puntos para dibujarlos, pero los cálculos estadísticos no usan esa muestra.
