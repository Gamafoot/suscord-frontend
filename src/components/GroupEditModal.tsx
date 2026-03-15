import { useEffect } from 'react';
import type { Chat } from '../types';
import { MediaImage } from './MediaImage';

interface GroupEditModalProps {
  chat: Chat;
  open: boolean;
  name: string;
  previewUrl?: string;
  busy: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}

export function GroupEditModal({
  chat,
  open,
  name,
  previewUrl,
  busy,
  error,
  onNameChange,
  onFileChange,
  onClose,
  onSubmit,
}: GroupEditModalProps) {
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

  const avatarSrc = previewUrl || chat.avatar_url;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit();
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="group-edit-title">
      <button className="modal-shell__backdrop" aria-label="Закрыть" onClick={onClose} disabled={busy} />

      <form className="group-edit-modal" onSubmit={handleSubmit}>
        <div className="group-edit-modal__header">
          <h2 id="group-edit-title" className="group-edit-modal__title">
            Редактировать группу
          </h2>
          <button
            className="group-edit-modal__close"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="group-edit-modal__body">
          <div className="group-avatar-editor">
            <div className="group-avatar-editor__preview">
              {avatarSrc ? (
                <MediaImage
                  src={avatarSrc}
                  alt={chat.name}
                  fallback={
                    <div className="group-avatar-editor__placeholder">
                      <i className="bi bi-people-fill" />
                    </div>
                  }
                />
              ) : (
                <div className="group-avatar-editor__placeholder">
                  <i className="bi bi-people-fill" />
                </div>
              )}
            </div>

            <label className="group-avatar-editor__action">
              <i className="bi bi-pencil-fill" />
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <input
            className="form-control group-edit-modal__input"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Название группы"
            maxLength={64}
            disabled={busy}
          />

          {error ? <div className="alert alert-danger mb-0">{error}</div> : null}
        </div>

        <div className="group-edit-modal__footer">
          <button className="btn group-edit-modal__cancel" type="button" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button className="btn group-edit-modal__submit" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}
