import type { Chat } from '../types';
import { Avatar } from './Avatar';

interface ChatSidebarProps {
  chats: Chat[];
  displayByChatId: Record<number, { name: string; avatarUrl?: string | null }>;
  memberCounts: Record<number, number>;
  selectedChatId: number | null;
  chatSearch: string;
  activeCallChatId: number | null;
  onChatSearchChange: (value: string) => void;
  onSelectChat: (chatId: number) => void;
}

export function ChatSidebar({
  chats,
  displayByChatId,
  memberCounts,
  selectedChatId,
  chatSearch,
  activeCallChatId,
  onChatSearchChange,
  onSelectChat,
}: ChatSidebarProps) {
  return (
    <aside className="sidebar-panel">
      <div className="search-box">
        <i className="bi bi-search search-box__icon" />
        <input
          className="form-control search-box__input"
          placeholder="Поиск чатов"
          value={chatSearch}
          onChange={(event) => onChatSearchChange(event.target.value)}
        />
      </div>

      <div className="chat-list">
        {chats.map((chat) => {
          const display = displayByChatId[chat.id] ?? { name: chat.name, avatarUrl: chat.avatar_url };
          const isSelected = chat.id === selectedChatId;
          const hasActiveCall = chat.id === activeCallChatId;
          const subtitle = hasActiveCall
            ? 'Идёт звонок'
            : chat.type === 'group'
              ? `${memberCounts[chat.id] ?? 0} участников`
              : null;
          return (
            <button
              key={chat.id}
              className={`chat-list__item ${isSelected ? 'chat-list__item-active' : ''}`}
              onClick={() => onSelectChat(chat.id)}
            >
              <Avatar name={display.name} url={display.avatarUrl} accent={chat.type === 'group' ? 'warm' : 'brand'} />
              <div className="chat-list__meta">
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-semibold text-truncate">{display.name}</span>
                  <span className="badge text-bg-secondary text-uppercase">{chat.type === 'group' ? 'группа' : 'личный'}</span>
                </div>
                {subtitle ? <small className="text-secondary">{subtitle}</small> : null}
              </div>
              {hasActiveCall ? <i className="bi bi-broadcast-pin text-warning" /> : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
