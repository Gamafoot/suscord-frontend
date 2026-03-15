import type { ErrorToast } from '../types';

interface ErrorToastStackProps {
  toasts: ErrorToast[];
  onDismiss: (id: string) => void;
  onToggleExpanded: (id: string) => void;
}

const DETAIL_THRESHOLD = 120;

export function ErrorToastStack({ toasts, onDismiss, onToggleExpanded }: ErrorToastStackProps) {
  if (!toasts.length) {
    return null;
  }

  return (
    <div className="error-toast-stack">
      {toasts.map((toast) => {
        const canExpand = toast.message.length > DETAIL_THRESHOLD;

        return (
          <article key={toast.id} className={`error-toast ${toast.expanded ? 'error-toast-expanded' : ''}`}>
            <div className="error-toast__header">
              <div className="error-toast__meta">
                <span className="error-toast__icon">
                  <i className="bi bi-exclamation-octagon-fill" />
                </span>
                <div>
                  <p className="mb-0 fw-semibold">Ошибка</p>
                  <small className="text-secondary">
                    {toast.pinned ? 'Требует ручного закрытия' : 'Уведомление исчезнет автоматически'}
                  </small>
                </div>
              </div>
              <button className="error-toast__close" type="button" aria-label="Закрыть" onClick={() => onDismiss(toast.id)}>
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <p className={`error-toast__message ${toast.expanded ? 'error-toast__message-expanded' : ''}`}>{toast.message}</p>

            {canExpand ? (
              <button className="error-toast__toggle" type="button" onClick={() => onToggleExpanded(toast.id)}>
                {toast.expanded ? 'Скрыть детали' : 'Раскрыть детали'}
              </button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
