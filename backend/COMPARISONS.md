# Comparaciones v0.4: diseño previo

Alternativas para reservar test sin persistencia:

1. Reenviar CSV y configuración en la fase final con hashes firmados. Reduce almacenamiento del servidor, pero exige firmar también particiones y estado de uso; no evita por sí solo repetir test y duplica transferencias.
2. Mantener DataFrames/pipelines en memoria. Es sencillo, pero compite con los 512 MB y añade problemas de reinicio y afinidad entre workers.
3. **Elegida: sesión efímera en disco**, con token aleatorio de 256 bits, configuración y particiones fijadas, TTL y cupos. No guarda modelos ni DataFrames. La API final solo admite token y candidato comparado. Marca el test como consumido antes de ejecutar, incluso si el trabajo falla: no se puede garantizar que un timeout no haya alcanzado test.

Se utilizará el mismo directorio temporal de la sesión para la entrada y el proceso hijo. Una comparación y una evaluación final son operaciones separadas, cada una con las protecciones existentes y un único plazo global; nunca se reinicia por fold. Todos los modelos y folds se ejecutan secuencialmente. Solo se habilitan tres folds; cinco no se consideran seguros en Render Free sin evidencia de capacidad. Random Forest conserva sus 100 árboles y restricciones actuales; si el conjunto completo de trabajos supera el presupuesto se devuelve el error del supervisor, sin ampliar recursos.

Primero se reserva test con el split existente. CV usa únicamente train: StratifiedKFold cuando cada clase tiene al menos tres observaciones; si no es viable, se rechaza con explicación, sin recurrir silenciosamente a folds no estratificados. Regresión utiliza KFold. Ambos usan shuffle y la semilla configurada. Cada fold crea un preprocesador nuevo, incluyendo las comprobaciones de cardinalidad y complejidad sobre su train. No se evalúa test durante CV.

Las métricas se calculan con el evaluador existente y se agregan sin redondeo. Desviación entre folds: muestral (ddof=1), descriptiva, no intervalo de confianza. Una métrica incompleta conserva sus valores nulos y motivos; no puede ganar el ranking por medias parciales. MAE y RMSE se minimizan, las demás se maximizan; los empates conservan el orden de candidatos, sin afirmar superioridad estadística.

Las medias de CV son aritméticas no ponderadas entre folds; cada fold aporta una puntuación. Los tiempos mostrados por candidato suman exclusivamente el fit del Pipeline; la duración global incluye todo el trabajo del hijo.

Las sesiones son locales a un proceso API (despliegue de un worker), no distribuidas. Reiniciar invalida los tokens. La limpieza se hará en cada acceso y mediante tarea periódica; habrá caducidad de 15 minutos, máximo tres sesiones y presupuesto total de 48 MiB. No se exponen rutas del servidor ni se aceptan nombres de archivo del cliente para acceder a sesiones. El token es una credencial de acceso: no registrarlo ni compartirlo. No hay garantía de supervivencia al reinicio ni de protección frente a un usuario que deliberadamente inicie comparaciones nuevas sobre los mismos datos.

## Contrato implementado

- `POST /api/comparisons`: multipart `file` y `config`. La configuración contiene `experiment` (exactamente el contrato individual existente), `models` (2–3 candidatos compatibles), `folds: 3` y `primary_metric` opcional. Devuelve agregados y resultados individuales de CV, tamaños de train/test, token y caducidad. Nunca devuelve métricas de test.
- `POST /api/comparisons/evaluate`: JSON `{ "token": "…", "model": "…" }`, sin CSV, configuración ni índices sustituibles. Los tokens viajan en el cuerpo, no en la URL; las carpetas temporales usan identificadores independientes del token. Se contrastan hashes SHA-256 del CSV y de la partición reservada antes de usarla. El resultado reutiliza el contrato individual `evaluation_scope: "test"` y sus gráficos.
- La API de comparaciones anuncia `0.4.0`; el resultado individual/final conserva `api_version: "0.3.1"` para mantener compatible el cliente existente. `/health` anuncia `0.4.0`.
- `410`: sesión caducada/desconocida o reinicio. `409`: test consumido o integridad alterada. `422`: configuración, métrica, candidato o CV no viable. `429`: otra operación o cupo de sesiones. Los errores 413/503/504 mantienen el significado de [RESOURCES.md](RESOURCES.md).

## Recursos y límites de sesiones

| Variable | Predeterminado | Alcance |
|---|---:|---|
| `ML_SESSION_TTL_SECONDS` | 900 | Caducidad desde el comienzo de la comparación; un trabajo activo no se elimina a mitad de ejecución. |
| `ML_MAX_SESSIONS` | 3 | Incluye comparaciones con test consumido hasta que caduquen. |
| `ML_SESSION_DISK_BYTES` | 50331648 (48 MiB) | Cupo comprobado antes y después de los trabajos, incluyendo CSV, configuración, índices y resultado. Durante la escritura del hijo puede haber un exceso transitorio limitado por los controles de entrada/salida existentes y el supervisor. |

Se limpia cada 30 segundos y en cada acceso. En Linux también se eliminan carpetas abandonadas por un proceso API muerto, identificadas por su marcador de propietario; nunca se recuperan como sesiones utilizables. En Windows esa recogida de carpetas de procesos abortados no está implementada, aunque la limpieza normal y por TTL sí está activa. La caducidad efectiva de una sesión inactiva puede demorarse hasta el siguiente barrido.

El permiso de instancia cubre las tres rutas (entrenamiento individual, CV y evaluación final). CV lanza **un solo hijo** y una sola supervisión de 60 s, RSS e hilos; ningún fold lanza procesos propios ni reinicia ese plazo. No se han aumentado los límites de RESOURCES.md. Los seis ejemplos completos se prueban con los tres candidatos y tres folds en local; esto no demuestra que todos terminen en Render con 0,1 CPU. No hay garantía dura de 512 MB: sigue vigente la limitación de supervisión RSS por muestreo. Un error/timeout de comparación descarta la sesión parcial.

## Uso e interpretación

Comparaciones reutiliza el asistente de Modelos: problema y predictores, train/test, preprocesamiento, modelos y CV. Los resultados incluyen ranking, todas las métricas, N por fold, fit en segundos, gráfico de medias y desviación y gráfico por fold. Las medias incompletas se identifican con su N y no participan en la selección del mejor candidato ni en el gráfico de medias completas. Se requiere elegir y confirmar expresamente un candidato antes de consultar test.

En CV, precision/recall/F1 con denominador nulo se conservan como indefinidos, con explicación por fold; no se sustituyen por cero ni se omiten silenciosamente clases de una media macro. R² de un fold constante es indefinido. El evaluador individual conserva su convención previa `zero_division=0`, explicada en su interfaz, por compatibilidad; la CV utiliza el modo explícito de indefinidos del mismo evaluador. La desviación de Accuracy se muestra en puntos porcentuales.

Cambiar roles, modelos, métrica, target, split o preprocesamiento invalida CV y evaluación final de la interfaz. Una consulta o intento de test deja una advertencia persistente mientras ese dataset siga cargado en Comparaciones. Recargar la página/cargar otro dataset reinicia el estado local; no existe un registro persistente que detecte consultas entre sesiones o en otras herramientas. No se afirma que ejecutar otra comparación restablezca la independencia de un test ya consultado.

No hay búsqueda de hiperparámetros, AutoML, pruebas de hipótesis, chatbot ni persistencia. Los datos agrupados o temporales requieren validación específica fuera de este flujo: KFold estratificado/aleatorio no los protege de fuga entre grupos o tiempos.
