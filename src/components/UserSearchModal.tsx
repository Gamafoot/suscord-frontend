import { useEffect } from 'react';
import { Avatar } from './Avatar';
import type { User } from '../types';

interface UserSearchModalProps {
  open: boolean;
  eyebrow: string;
  title: string;
  placeholder: string;
  helperText: string;
  emptyText: string;
  idleText: string;
  actionLabel: string;
  actionBusyLabel: string;
  query: string;
  users: User[];
  busy: boolean;
  actionUserId: number | null;
  error: string | null;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onAction: (user: User) => Promise<void>;
}

export function UserSearchModal({
  open,
  eyebrow,
  title,
  placeholder,
  helperText,
  emptyText,
  idleText,
  actionLabel,
  actionBusyLabel,
  query,
  users,
  busy,
  actionUserId,
  error,
  onQueryChange,
  onClose,
  onAction,
}: UserSearchModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="user-search-title">
      <button className="modal-shell__backdrop" aria-label="Закрыть" onClick={onClose} />

      <div className="user-search-modal">
        <div className="user-search-modal__header">
          <div>
            <p className="eyebrow mb-2">{eyebrow}</p>
            <h2 id="user-search-title" className="user-search-modal__title">
              {title}
            </h2>
          </div>
          <button className="group-edit-modal__close" type="button" onClick={onClose} aria-label="Закрыть">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="search-box user-search-modal__search">
          <i className="bi bi-search search-box__icon" />
          <input
            className="form-control search-box__input"
            placeholder={placeholder}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>

        {error ? <div className="alert alert-danger mb-0">{error}</div> : null}

        <div className="user-search-modal__results">
          {!query.trim() ? (
            <div className="pane-empty pane-empty-compact">{idleText}</div>
          ) : busy ? (
            <div className="pane-empty pane-empty-compact">
              <div className="spinner-border text-warning" />
            </div>
          ) : users.length ? (
            users.map((user) => (
              <div key={user.id} className="user-search-result">
                <div className="d-flex align-items-center gap-3 min-w-0">
                  <Avatar name={user.username} url={user.avatar_url} size="md" accent="warm" />
                  <div className="min-w-0">
                    <strong className="d-block text-truncate">{user.username}</strong>
                    <small className="text-secondary">{helperText}</small>
                  </div>
                </div>
                <button
                  className="btn btn-brand"
                  type="button"
                  onClick={() => void onAction(user)}
                  disabled={actionUserId === user.id}
                >
                  {actionUserId === user.id ? actionBusyLabel : actionLabel}
                </button>
              </div>
            ))
          ) : (
            <div className="pane-empty pane-empty-compact">{emptyText}</div>
          )}
        </div>
      </div>
    </div>
  );
}
