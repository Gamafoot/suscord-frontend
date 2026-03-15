import type { Chat, Message, User } from '../types';
import { findUser, formatMessageDay, formatMessageTime, resolveMediaUrl } from '../lib/utils';
import { Avatar } from './Avatar';
import { MediaImage } from './MediaImage';

interface MessageListProps {
  chat: Chat;
  currentUserId: number;
  messages: Message[];
  members: User[];
  loading: boolean;
  editingMessageId: number | null;
  editingText: string;
  messageActionBusy: boolean;
  onStartEdit: (message: Message) => void;
  onEditTextChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => Promise<void>;
  onDeleteMessage: (message: Message) => Promise<void>;
}

export function MessageList({
  chat,
  currentUserId,
  messages,
  members,
  loading,
  editingMessageId,
  editingText,
  messageActionBusy,
  onStartEdit,
  onEditTextChange,
  onCancelEdit,
  onSaveEdit,
  onDeleteMessage,
}: MessageListProps) {
  if (loading) {
    return (
      <div className="pane-empty">
        <div className="spinner-border text-warning" />
      </div>
    );
  }

  if (!messages.length) {
    return (
      <div className="pane-empty">
        <i className="bi bi-chat-heart display-5 text-warning" />
        <h3>Сообщений пока нет</h3>
        <p>Начните разговор в чате {chat.name}.</p>
      </div>
    );
  }

  let lastDay = '';

  return (
    <div className="message-list">
      {messages.map((message) => {
        const author = message.user?.id > 0 ? message.user : findUser(members, message.user_id);
        const authorId = author?.id ?? message.user_id;
        const authorName = author?.username ?? `User ${authorId}`;
        const isOwn = authorId === currentUserId;
        const isEditing = editingMessageId === message.id;
        const messageDay = formatMessageDay(message.created_at);
        const showDay = messageDay !== lastDay;
        lastDay = messageDay;

        return (
          <div key={message.id}>
            {showDay ? <div className="message-day-divider">{messageDay}</div> : null}
            <article className={`message-row ${isOwn ? 'message-row-own' : ''}`}>
              <Avatar
                name={authorName}
                url={author?.avatar_url}
                size="sm"
                accent={isOwn ? 'warm' : 'brand'}
              />
              <div className="message-bubble">
                <div className="message-bubble__header">
                  <div className="message-bubble__meta">
                    <strong>{authorName}</strong>
                    <span>{formatMessageTime(message.created_at)}</span>
                  </div>

                  {isOwn ? (
                    <div className="message-actions">
                      <button
                        className="message-action-btn"
                        type="button"
                        title="Редактировать сообщение"
                        onClick={() => onStartEdit(message)}
                        disabled={messageActionBusy}
                      >
                        <i className="bi bi-pencil-fill" />
                      </button>
                      <button
                        className="message-action-btn message-action-btn-danger"
                        type="button"
                        title="Удалить сообщение"
                        onClick={() => void onDeleteMessage(message)}
                        disabled={messageActionBusy}
                      >
                        <i className="bi bi-trash3-fill" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {isEditing ? (
                  <div className="message-edit-box">
                    <textarea
                      className="form-control message-edit-box__input"
                      rows={3}
                      value={editingText}
                      onChange={(event) => onEditTextChange(event.target.value)}
                      disabled={messageActionBusy}
                    />
                    <div className="message-edit-box__actions">
                      <button
                        className="btn btn-outline-light"
                        type="button"
                        onClick={onCancelEdit}
                        disabled={messageActionBusy}
                      >
                        Отмена
                      </button>
                      <button
                        className="btn btn-brand"
                        type="button"
                        onClick={() => void onSaveEdit()}
                        disabled={messageActionBusy || !editingText.trim()}
                      >
                        Сохранить
                      </button>
                    </div>
                  </div>
                ) : message.content ? (
                  <p className="mb-0">{message.content}</p>
                ) : null}

                {message.attachments.length ? (
                  <div className="attachment-grid mt-3">
                    {message.attachments.map((attachment) => {
                      const src = resolveMediaUrl(attachment.file_url);
                      const isImage = attachment.mime_type.startsWith('image/');
                      return isImage ? (
                        <a key={attachment.id} href={src} className="attachment-card" target="_blank" rel="noreferrer">
                          <MediaImage src={src} alt={attachment.mime_type} />
                        </a>
                      ) : (
                        <a key={attachment.id} href={src} className="attachment-file" target="_blank" rel="noreferrer">
                          <i className="bi bi-paperclip" />
                          <span>{attachment.mime_type}</span>
                        </a>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}
