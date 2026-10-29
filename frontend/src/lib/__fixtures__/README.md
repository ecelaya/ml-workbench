# Resultados reales de CV para pruebas visuales

Los tres JSON se generaron localmente con `app.comparison.compare_models`, los CSV completos incluidos en `public/datasets`, split de test 20 %, semilla 42 y tres folds. No se usan en la interfaz ni representan métricas ficticias para usuarios.

- Iris: cuatro medidas como predictores; regresión logística y árbol de clasificación; F1 macro.
- Titanic: age, fare, sibsp, parch, sex, embarked y pclass; sex/embarked/pclass como categorías; regresión logística y árbol; clase positiva `1`, ROC-AUC.
- California Housing: ocho predictores numéricos originales; regresión lineal y árbol; RMSE.

Preprocesamiento: mediana numérica, imputación categórica por moda, escalado estándar y One-Hot categórico; límites actuales del backend. El campo session_token es un identificador de fixture, no un token real, y expires_at es cero. Los tests utilizan estos resultados guardados: cambiar métricas o visualizaciones no requiere entrenar de nuevo.
