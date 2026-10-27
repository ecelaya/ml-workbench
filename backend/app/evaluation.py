import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, mean_absolute_error, precision_score, r2_score, recall_score, roc_auc_score, root_mean_squared_error


def evaluate(pipeline, X_test, y_test, task):
    prediction = pipeline.predict(X_test)
    warnings = []
    if task == 'classification':
        classes = sorted(set(pipeline.classes_) | set(y_test))
        metrics = {
            'accuracy': float(accuracy_score(y_test, prediction)),
            'precision_macro': float(precision_score(y_test, prediction, labels=classes, average='macro', zero_division=0)),
            'recall_macro': float(recall_score(y_test, prediction, labels=classes, average='macro', zero_division=0)),
            'f1_macro': float(f1_score(y_test, prediction, labels=classes, average='macro', zero_division=0)),
            'roc_auc': None,
        }
        # Binary probabilities refer to the estimator's second ordered class.
        if len(classes) == 2 and len(pipeline.classes_) == 2 and len(set(y_test)) == 2 and hasattr(pipeline, 'predict_proba'):
            metrics['roc_auc'] = float(roc_auc_score(np.asarray(y_test) == pipeline.classes_[1], pipeline.predict_proba(X_test)[:, 1]))
        elif len(classes) == 2:
            warnings.append('ROC-AUC no definido: test debe contener ambas clases y el estimador debe ofrecer probabilidades.')
        matrix = confusion_matrix(y_test, prediction, labels=classes).tolist()
        return {'metrics': metrics, 'confusion_matrix': matrix, 'classes': classes, 'positive_class': str(pipeline.classes_[1]) if len(pipeline.classes_) == 2 else None, 'warnings': warnings, 'predictions': []}
    r2 = None if np.ptp(np.asarray(y_test, dtype=float)) == 0 else float(r2_score(y_test, prediction, force_finite=False))
    if r2 is None:
        warnings.append('R² no está definido porque el objetivo es constante en test.')
    metrics = {'mae': float(mean_absolute_error(y_test, prediction)), 'rmse': float(root_mean_squared_error(y_test, prediction)), 'r2': r2}
    if any(value is not None and not np.isfinite(value) for value in metrics.values()):
        raise ValueError('Las métricas exceden el rango numérico representable; revisa las magnitudes del dataset.')
    indices = np.linspace(0, len(y_test) - 1, min(500, len(y_test)), dtype=int)
    points = [{'actual': float(y_test.iloc[i]), 'predicted': float(prediction[i])} for i in indices]
    return {'metrics': metrics, 'confusion_matrix': None, 'classes': [], 'positive_class': None, 'warnings': warnings, 'predictions': points}
