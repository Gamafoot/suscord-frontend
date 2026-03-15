import type { LoginPayload } from '../types';
import {
  normalizeChat,
  normalizeChats,
  normalizeMessage,
  normalizeMessages,
  normalizeUser,
  normalizeUsers,
} from './utils';
import { API_BASE, FETCH_TIMEOUT_MS } from './config';

type RequestData = BodyInit | object | undefined;

interface RequestOptions {
  method?: RequestInit['method'];
  data?: RequestData;
  headers?: HeadersInit;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiFetch<T>(path: string, { method = 'GET', data, headers: initHeaders }: RequestOptions = {}): Promise<T> {
  const headers = new Headers(initHeaders);
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let body: BodyInit | undefined;

  if (data instanceof FormData) {
    body = data;
  } else if (data !== undefined && typeof data === 'object') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(data);
  } else if (data !== undefined) {
    body = data;
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      body,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(text || `Request failed with ${response.status}`, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }

    return (await response.text()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error(`Request timed out after ${FETCH_TIMEOUT_MS}ms: ${path}`);
      throw new ApiError(`Request timed out after ${FETCH_TIMEOUT_MS}ms`, 408);
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export const api = {
  login(payload: LoginPayload) {
    return apiFetch<void>('/auth/login', {
      method: 'POST',
      data: payload,
    });
  },

  logout() {
    return apiFetch<void>('/auth/logout', {
      method: 'POST',
    });
  },

  me() {
    return apiFetch<unknown>('/users/me').then((payload) => {
      const user = normalizeUser(payload);
      if (user.id <= 0) {
        throw new Error('Unauthorized');
      }
      return user;
    });
  },

  updateMe(payload: { username?: string; file?: File | null; }) {
    const body = new FormData();
    if (payload.username !== undefined) {
      body.append('username', payload.username);
    }
    if (payload.file) {
      body.append('file', payload.file);
    }

    return apiFetch<unknown>('/users/me', {
      method: 'PATCH',
      data: body,
    }).then(normalizeUser);
  },

  listChats(search = '') {
    const query = new URLSearchParams();
    if (search.trim()) {
      query.set('search', search.trim());
    }

    return apiFetch<unknown>(`/chats${query.size ? `?${query}` : ''}`).then(normalizeChats);
  },

  createPrivate(friendId: number) {
    return apiFetch<unknown>('/chats/private', {
      method: 'POST',
      data: { friend_id: friendId },
    }).then(normalizeChat);
  },

  createGroup(name: string) {
    return apiFetch<unknown>('/chats/group', {
      method: 'POST',
      data: { name },
    }).then(normalizeChat);
  },

  updateChat(chatId: number, payload: { name?: string; file?: File | null; }) {
    const body = new FormData();
    if (payload.name !== undefined) {
      body.append('name', payload.name);
    }
    if (payload.file) {
      body.append('file', payload.file);
    }

    return apiFetch<unknown>(`/chats/${chatId}`, {
      method: 'PATCH',
      data: body,
    }).then(normalizeChat);
  },

  getChatMembers(chatId: number) {
    return apiFetch<unknown>(`/chats/${chatId}/members`).then(normalizeUsers);
  },

  getChatNonMembers(chatId: number) {
    return apiFetch<unknown>(`/chats/${chatId}/non-members`).then(normalizeUsers);
  },

  inviteToChat(chatId: number, userId: number) {
    return apiFetch<void>(`/chats/${chatId}/invite`, {
      method: 'POST',
      data: { user_id: userId },
    });
  },

  leaveChat(chatId: number) {
    return apiFetch<void>(`/chats/${chatId}/leave`);
  },

  acceptChatInvite(code: string) {
    return apiFetch<void>(`/chats/invite/accept/${code}`);
  },

  searchUsers(search = '') {
    const query = new URLSearchParams();
    if (search.trim()) {
      query.set('search', search.trim());
    }

    return apiFetch<unknown>(`/users${query.size ? `?${query}` : ''}`).then(normalizeUsers);
  },

  listMessages(chatId: number, lastMessageId = 0, limit = 50) {
    const query = new URLSearchParams({
      last_message_id: String(lastMessageId),
      limit: String(limit),
    });

    return apiFetch<unknown>(`/chats/${chatId}/messages?${query.toString()}`).then(normalizeMessages);
  },

  sendMessage(chatId: number, payload: { content: string; files: File[]; }) {
    const body = new FormData();
    body.append('type', 'text');
    body.append('content', payload.content);
    payload.files.forEach((file) => body.append('file', file));

    return apiFetch<unknown>(`/chats/${chatId}/messages`, {
      method: 'POST',
      data: body,
    }).then(normalizeMessage);
  },

  updateMessage(messageId: number, content: string) {
    return apiFetch<unknown>(`/messages/${messageId}`, {
      method: 'PATCH',
      data: { content },
    }).then(normalizeMessage);
  },

  deleteMessage(messageId: number) {
    return apiFetch<void>(`/messages/${messageId}`, {
      method: 'DELETE',
    });
  },

  currentCallMembers() {
    return apiFetch<unknown>('/current-call-room/members').then(normalizeUsers);
  },

  getCallToken(room: string, identity?: string) {
    const query = new URLSearchParams({ room });
    if (identity) {
      query.set('identity', identity);
    }

    return apiFetch<{ token: string; }>(`/call/get_token?${query.toString()}`);
  },
};
