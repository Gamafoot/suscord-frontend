export type ChatType = 'private' | 'group';

export interface User {
  id: number;
  username: string;
  avatar_url?: string | null;
}

export interface Chat {
  id: number;
  type: ChatType;
  name: string;
  avatar_url?: string | null;
}

export interface Attachment {
  id: number;
  message_id: number;
  file_url: string;
  file_size: number;
  mime_type: string;
}

export interface Message {
  id: number;
  chat_id: number;
  user: User;
  user_id: number;
  type: string;
  content: string;
  created_at: string;
  updated_at: string;
  attachments: Attachment[];
}

export interface SocketEnvelope {
  event: string;
  data?: Record<string, unknown>;
  chat_id?: number;
}

export interface InviteToast {
  id: string;
  kind: 'call' | 'chat';
  chatId: number | null;
  chatName: string;
  inviterName: string;
  avatarUrl?: string | null;
  code?: string;
  expiresAt: number;
  ttlMs: number;
}

export interface ErrorToast {
  id: string;
  message: string;
  expiresAt: number;
  ttlMs: number;
  pinned: boolean;
  expanded: boolean;
}

export interface LoginPayload {
  username: string;
  password: string;
}
