import type { Chat, Message, User } from '../types';
import { BACKEND_HTTP_ORIGIN } from './config';

export function resolveMediaUrl(path?: string | null): string | undefined {
  if (!path) {
    return undefined;
  }

  if (/^https?:\/\//.test(path)) {
    return path;
  }

  try {
    return new URL(path, BACKEND_HTTP_ORIGIN).toString();
  } catch {
    return undefined;
  }
}

export function getInitials(label?: string | null): string {
  const safeLabel = label?.trim() || 'Неизвестно';

  return safeLabel
    .split(' ')
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatMessageDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Неизвестная дата';
  }
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort(
    (left, right) =>
      toTimestamp(left.created_at) - toTimestamp(right.created_at),
  );
}

export function upsertChat(list: Chat[], chat: Chat): Chat[] {
  const next = list.filter((item) => item.id !== chat.id);
  return [chat, ...next];
}

export function upsertMessage(list: Message[], message: Message): Message[] {
  const existing = message.id ? list.find((item) => item.id === message.id) : undefined;
  const next = list.filter((item) => item.id !== message.id);
  next.push(mergeMessage(existing, message));
  return sortMessages(next);
}

export function removeMessage(list: Message[], messageId: number): Message[] {
  return list.filter((item) => item.id !== messageId);
}

export function findUser(users: User[], userId: number): User | undefined {
  return users.find((user) => user.id === userId);
}

export function upsertUser(users: User[], user: User): User[] {
  const next = users.filter((item) => item.id !== user.id);
  next.push(user);
  return next.sort((left, right) => left.username.localeCompare(right.username));
}

export function removeUser(users: User[], userId: number): User[] {
  return users.filter((user) => user.id !== userId);
}

export function buildCallRoomName(chatId: number): string {
  return `chat-${chatId}`;
}

export function summarizeChat(chat: Chat, members: User[]): string {
  if (chat.type === 'group') {
    return `${members.length} участников`;
  }

  return members[0]?.username ?? 'Личный чат';
}

export function getChatDisplay(chat: Chat, members: User[], currentUserId?: number | null): { name: string; avatarUrl?: string | null } {
  if (chat.type !== 'private') {
    return {
      name: chat.name,
      avatarUrl: chat.avatar_url,
    };
  }

  const otherMember =
    members.find((member) => member.id !== currentUserId) ??
    members[0];

  return {
    name: otherMember?.username ?? chat.name,
    avatarUrl: otherMember?.avatar_url ?? chat.avatar_url,
  };
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function normalizeUser(value: unknown): User {
  const record = asRecord(value);
  return {
    id: toNumber(record.id),
    username: toNonEmptyString(record.username, `User ${toNumber(record.id) || 'unknown'}`),
    avatar_url: toNullableString(record.avatar_url),
  };
}

export function normalizeUsers(value: unknown): User[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeUser);
}

export function normalizeChat(value: unknown): Chat {
  const record = asRecord(value);
  const id = toNumber(record.id);
  return {
    id,
    type: record.type === 'group' ? 'group' : 'private',
    name: toNonEmptyString(record.name, `Chat ${id || 'unknown'}`),
    avatar_url: toNullableString(record.avatar_url),
  };
}

export function normalizeChats(value: unknown): Chat[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeChat);
}

export function normalizeMessage(value: unknown): Message {
  const record = asRecord(value);
  const rawUser = record.user ?? record.user_id;
  const author = normalizeUser(rawUser);
  const id = toNumber(record.id);
  const userId = toNumber(record.user_id) || author.id;
  return {
    id,
    chat_id: toNumber(record.chat_id),
    user: author,
    user_id: userId,
    type: toNonEmptyString(record.type, 'text'),
    content: toStringValue(record.content),
    created_at: toIsoString(record.created_at),
    updated_at: toIsoString(record.updated_at ?? record.created_at),
    attachments: normalizeAttachments(record.attachments, id),
  };
}

export function normalizeMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeMessage);
}

function normalizeAttachments(value: unknown, messageId: number): Message['attachments'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = asRecord(item);
    return {
      id: toNumber(record.id),
      message_id: toNumber(record.message_id) || messageId,
      file_url: toStringValue(record.file_url),
      file_size: toNumber(record.file_size),
      mime_type: toNonEmptyString(record.mime_type, 'application/octet-stream'),
    };
  });
}

function mergeMessage(previous: Message | undefined, next: Message): Message {
  if (!previous) {
    return next;
  }

  const hasNextUser = next.user_id > 0 || next.user.id > 0;
  const hasPreviousUser = previous.user_id > 0 || previous.user.id > 0;
  const user = hasNextUser ? next.user : previous.user;
  const user_id = next.user_id || previous.user_id;
  const attachments = next.attachments.length ? next.attachments : previous.attachments;

  return {
    ...previous,
    ...next,
    user: hasNextUser || !hasPreviousUser ? user : previous.user,
    user_id,
    attachments,
  };
}

function toNonEmptyString(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toIsoString(value: unknown): string {
  if (typeof value === 'string' && !Number.isNaN(new Date(value).getTime())) {
    return value;
  }

  return new Date(0).toISOString();
}

function toTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
