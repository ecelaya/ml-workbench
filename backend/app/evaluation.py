import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, mean_absolute_error, precision_recall_fscore_support, precision_score, r2_score, recall_score, roc_auc_score, root_mean_squared_error


def evaluate(pipeline, X_test, y_test, task, positive_class=None, undefined_nan=False):
    prediction = pipeline.predict(X_test)
    warnings = []
    if task == 'classification':
        classes = sorted(set(pipeline.classes_) | set(y_test))
        metrics = {
            'accuracy': float(accuracy_score(y_test, prediction)),
            'precision_macro': float(precision_score(y_test, prediction, labels=classes, average='macro', zero_division=0)),
            'recall_macro': float(recall_score(y_test, prediction, labels=classes, average='macro', zero_division=0)),
            'f1_macro': float(f1_score(y_test, prediction, labels=classes, average='macro', zero_division=0)),
        }
        precision, recall, f1, support = precision_recall_fscore_support(y_test, prediction, labels=classes, zero_division=0)
        if undefined_nan:
            precision, recall, f1, support = precision_recall_fscore_support(y_test, prediction, labels=classes, zero_division=np.nan)
            for name, values in [('precision_macro', precision), ('recall_macro', recall), ('f1_macro', f1)]:
                metrics[name] = float(np.mean(values))
        by_class = [{'label': str(label), 'precision': float(precision[i]), 'recall': float(recall[i]), 'f1': float(f1[i]), 'support': int(support[i])} for i, label in enumerate(classes)]
        if np.any(support == 0):
            warnings.append('Alguna clase no tiene observaciones en test. Sus métricas por clase usan zero_division=0 y la normalización de esa fila no está definida.')
        if len(classes) == 2:
            if positive_class is None:
                positive_class = str(classes[-1])
                warnings.append(f'Clase positiva no configurada por el cliente: se utiliza «{positive_class}». Puede elegirse explícitamente en el asistente.')
            negative_class = next(label for label in classes if label != positive_class)
            metrics.update({
                'precision_positive': float(precision_score(y_test, prediction, average='binary', pos_label=positive_class, zero_division=0)),
                'recall_positive': float(recall_score(y_test, prediction, average='binary', pos_label=positive_class, zero_division=0)),
                'f1_positive': float(f1_score(y_test, prediction, average='binary', pos_label=positive_class, zero_division=0)),
                'sensitivity': float(recall_score(y_test, prediction, average='binary', pos_label=positive_class, zero_division=0)) if np.any(np.asarray(y_test) == positive_class) else None,
                'specificity': float(recall_score(y_test, prediction, average='binary', pos_label=negative_class, zero_division=0)) if np.any(np.asarray(y_test) == negative_class) else None,
                'roc_auc': None,
            })
            if undefined_nan:
                p, r, f, _ = precision_recall_fscore_support(y_test, prediction, labels=[positive_class], zero_division=np.nan)
                metrics.update(precision_positive=float(p[0]), recall_positive=float(r[0]), f1_positive=float(f[0]))
            if len(pipeline.classes_) == 2 and len(set(y_test)) == 2 and hasattr(pipeline, 'predict_proba'):
                column = list(pipeline.classes_).index(positive_class)
                metrics['roc_auc'] = float(roc_auc_score(np.asarray(y_test) == positive_class, pipeline.predict_proba(X_test)[:, column]))
            else:
                warnings.append('ROC-AUC no definido: test debe contener ambas clases y el estimador debe ofrecer probabilidades.')
        matrix = confusion_matrix(y_test, prediction, labels=classes).tolist()
        normalized = confusion_matrix(y_test, prediction, labels=classes, normalize='true').tolist()
        return {'metrics': metrics, 'class_metrics': by_class, 'confusion_matrix': matrix, 'confusion_matrix_normalized': normalized, 'classes': classes, 'positive_class': positive_class, 'warnings': warnings, 'predictions': [], 'regression_bounds': None, 'residual_bounds': None}
    r2 = None if np.ptp(np.asarray(y_test, dtype=float)) == 0 else float(r2_score(y_test, prediction, force_finite=False))
    if r2 is None:
        warnings.append('R² no está definido porque el objetivo es constante en test.')
    metrics = {'mae': float(mean_absolute_error(y_test, prediction)), 'rmse': float(root_mean_squared_error(y_test, prediction)), 'r2': r2}
    if any(value is not None and not np.isfinite(value) for value in metrics.values()):
        raise ValueError('Las métricas exceden el rango numérico representable; revisa las magnitudes del dataset.')
    indices = np.linspace(0, len(y_test) - 1, min(500, len(y_test)), dtype=int)
    residuals = np.asarray(y_test, dtype=float) - prediction
    points = [{'actual': float(y_test.iloc[i]), 'predicted': float(prediction[i]), 'residual': float(residuals[i])} for i in indices]
    bounds = [float(min(np.min(y_test), np.min(prediction))), float(max(np.max(y_test), np.max(prediction)))]
    residual_bounds = [float(min(0, np.min(residuals))), float(max(0, np.max(residuals)))]
    return {'metrics': metrics, 'class_metrics': [], 'confusion_matrix': None, 'confusion_matrix_normalized': None, 'classes': [], 'positive_class': None, 'warnings': warnings, 'predictions': points, 'regression_bounds': bounds, 'residual_bounds': residual_bounds}
