import { useEffect } from 'react';
import type { User } from '../types';
import { getInitials } from '../lib/utils';
import { MediaImage } from './MediaImage';

interface UserSettingsModalProps {
  user: User;
  open: boolean;
  username: string;
  previewUrl?: string;
  busy: boolean;
  error: string | null;
  onUsernameChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export function UserSettingsModal({
  user,
  open,
  username,
  previewUrl,
  busy,
  error,
  onUsernameChange,
  onFileChange,
  onClose,
  onSubmit,
  onLogout,
}: UserSettingsModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) {
    return null;
  }

  const avatarSrc = previewUrl || user.avatar_url;
  const initials = getInitials(username.trim() || user.username);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit();
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="user-settings-title">
      <button className="modal-shell__backdrop" aria-label="Закрыть" onClick={onClose} disabled={busy} />

      <form className="profile-settings-modal" onSubmit={handleSubmit}>
        <div className="profile-settings-modal__header">
          <div>
            <p className="eyebrow mb-2">Настройки</p>
            <h2 id="user-settings-title" className="profile-settings-modal__title">
              Профиль и сессия
            </h2>
            <p className="profile-settings-modal__subtitle mb-0">
              Обновите ник, аватар и управляйте текущей сессией.
            </p>
          </div>
          <button
            className="profile-settings-modal__close"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="profile-settings-modal__body">
          <section className="profile-settings-card profile-settings-card-accent">
            <div className="profile-avatar-editor">
              <div className="profile-avatar-editor__halo" />
              <div className="profile-avatar-editor__preview">
                {avatarSrc ? (
                  <MediaImage
                    src={avatarSrc}
                    alt={user.username}
                    fallback={
                      <div className="profile-avatar-editor__placeholder">
                        <span>{initials}</span>
                      </div>
                    }
                  />
                ) : (
                  <div className="profile-avatar-editor__placeholder">
                    <span>{initials}</span>
                  </div>
                )}
              </div>

              <label className="profile-avatar-editor__action" title="Загрузить новую аватарку">
                <i className="bi bi-camera-fill" />
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="profile-settings-card__meta">
              <strong>{username.trim() || user.username}</strong>
              <span>@{user.id}</span>
            </div>

            <p className="profile-settings-card__hint mb-0">
              Аватар обновится сразу после сохранения.
            </p>
          </section>

          <section className="profile-settings-card">
            <label className="profile-settings-field">
              <span className="profile-settings-field__label">Никнейм</span>
              <input
                className="form-control profile-settings-field__input"
                value={username}
                onChange={(event) => onUsernameChange(event.target.value)}
                placeholder="Введите новый ник"
                maxLength={64}
                disabled={busy}
              />
            </label>

            <div className="profile-settings-field__note">
              Используется в чатах, сообщениях и списке участников звонка.
            </div>

            {error ? <div className="alert alert-danger mb-0">{error}</div> : null}

            <div className="profile-settings-modal__footer">
              <button className="btn profile-settings-modal__logout" type="button" onClick={() => void onLogout()} disabled={busy}>
                <i className="bi bi-box-arrow-right me-2" />
                Выйти
              </button>
              <div className="profile-settings-modal__actions">
                <button className="btn profile-settings-modal__cancel" type="button" onClick={onClose} disabled={busy}>
                  Отмена
                </button>
                <button className="btn profile-settings-modal__submit" type="submit" disabled={busy || !username.trim()}>
                  {busy ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
