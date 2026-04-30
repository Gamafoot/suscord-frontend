import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AudioCaptureOptions, Room } from 'livekit-client';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, PublicOnlyRoute } from './authGuards';
import { ChatSidebar } from '../components/ChatSidebar';
import { GroupEditModal } from '../components/GroupEditModal';
import { MessageComposer } from '../components/MessageComposer';
import { MessageList } from '../components/MessageList';
import { InviteStack } from '../components/InviteStack';
import { ErrorToastStack } from '../components/ErrorToastStack';
import { UserSearchModal } from '../components/UserSearchModal';
import { UserSettingsModal } from '../components/UserSettingsModal';
import { Avatar } from '../components/Avatar';
import { LoginScreen } from '../components/LoginScreen';
import { ApiError, api } from '../lib/api';
import { WS_BASE } from '../lib/config';
import {
  asRecord,
  buildCallRoomName,
  normalizeChat,
  getChatDisplay,
  normalizeMessage,
  normalizeUser,
  sortMessages,
  summarizeChat,
  upsertChat,
  upsertMessage,
  removeMessage,
  upsertUser,
  removeUser,
} from '../lib/utils';
import type { Chat, ErrorToast, InviteToast, LoginPayload, Message, SocketEnvelope, User } from '../types';

const INVITE_TTL_MS = 10_000;
const ERROR_TTL_MS = 8_000;
const RECONNECT_DELAY_MS = 3_000;
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL?.trim();
const DEFAULT_REMOTE_VOLUME = 100;
const AUDIO_CAPTURE_OPTIONS: AudioCaptureOptions = {
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true,
};

interface LivekitAudioEntry {
  element: HTMLMediaElement;
  track: {
    setVolume?: (volume: number) => void;
    detach?: (element?: HTMLMediaElement) => HTMLMediaElement[] | void;
  };
  participantIdentity?: string;
}

interface LivekitVideoTrack {
  kind?: string;
  sid?: string;
  source?: string;
  mediaStreamTrack?: MediaStreamTrack;
  attach: () => HTMLMediaElement;
  detach?: (element?: HTMLMediaElement) => HTMLMediaElement[] | void;
}

interface LivekitScreenEntry {
  participantIdentity: string;
  isLocal: boolean;
  track: LivekitVideoTrack;
}

const SCREEN_SHARE_SOURCE = 'screen_share';

export function App() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [createGroupBusy, setCreateGroupBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [messagesByChat, setMessagesByChat] = useState<Record<number, Message[]>>({});
  const [membersByChat, setMembersByChat] = useState<Record<number, User[]>>({});
  const [loadingChatId, setLoadingChatId] = useState<number | null>(null);
  const [composerText, setComposerText] = useState('');
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');
  const [messageActionBusy, setMessageActionBusy] = useState(false);
  const [invites, setInvites] = useState<InviteToast[]>([]);
  const [errorToasts, setErrorToasts] = useState<ErrorToast[]>([]);
  const [wsOnline, setWsOnline] = useState(false);
  const [activeCallChatId, setActiveCallChatId] = useState<number | null>(null);
  const [callMembersByChat, setCallMembersByChat] = useState<Record<number, User[]>>({});
  const [callVolumes, setCallVolumes] = useState<Record<number, number>>({});
  const [callBusy, setCallBusy] = useState(false);
  const [muteBusy, setMuteBusy] = useState(false);
  const [screenShareBusy, setScreenShareBusy] = useState(false);
  const [selfMuted, setSelfMuted] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [localParticipantIdentity, setLocalParticipantIdentity] = useState<string | null>(null);
  const [screenShares, setScreenShares] = useState<Record<string, { isLocal: boolean; }>>({});
  const [watchingScreenShareIdentity, setWatchingScreenShareIdentity] = useState<string | null>(null);
  const [primaryPaneMode, setPrimaryPaneMode] = useState<'chat' | 'screen'>('chat');
  const [screenShareFullscreen, setScreenShareFullscreen] = useState(false);
  const [screenShareVersion, setScreenShareVersion] = useState(0);
  const [leaveChatBusy, setLeaveChatBusy] = useState(false);
  const [groupEditOpen, setGroupEditOpen] = useState(false);
  const [groupEditName, setGroupEditName] = useState('');
  const [groupEditFile, setGroupEditFile] = useState<File | null>(null);
  const [groupEditPreview, setGroupEditPreview] = useState<string | undefined>();
  const [groupEditBusy, setGroupEditBusy] = useState(false);
  const [groupEditError, setGroupEditError] = useState<string | null>(null);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | undefined>();
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<User[]>([]);
  const [userSearchBusy, setUserSearchBusy] = useState(false);
  const [userSearchError, setUserSearchError] = useState<string | null>(null);
  const [addUserBusyId, setAddUserBusyId] = useState<number | null>(null);
  const [groupInviteOpen, setGroupInviteOpen] = useState(false);
  const [groupInviteQuery, setGroupInviteQuery] = useState('');
  const [groupInviteResults, setGroupInviteResults] = useState<User[]>([]);
  const [groupInviteBusy, setGroupInviteBusy] = useState(false);
  const [groupInviteError, setGroupInviteError] = useState<string | null>(null);
  const [inviteUserBusyId, setInviteUserBusyId] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const socketHandlerRef = useRef<(payload: unknown) => void>(() => undefined);
  const livekitRoomRef = useRef<Room | null>(null);
  const livekitAudioSinkRef = useRef<HTMLDivElement | null>(null);
  const livekitAudioEntriesRef = useRef(new Map<string, LivekitAudioEntry>());
  const livekitAudioContextRef = useRef<AudioContext | null>(null);
  const livekitScreenEntriesRef = useRef(new Map<string, LivekitScreenEntry>());
  const livekitScreenShellRef = useRef<HTMLElement | null>(null);
  const livekitScreenStageRef = useRef<HTMLDivElement | null>(null);
  const livekitScreenStageTrackRef = useRef<LivekitVideoTrack | null>(null);
  const livekitScreenStageElementRef = useRef<HTMLMediaElement | null>(null);
  const chatBodyRef = useRef<HTMLElement | null>(null);
  const lastAutoScrolledChatRef = useRef<number | null>(null);
  const lastMessageCountRef = useRef(0);
  const wasNearBottomRef = useRef(true);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );
  const selectedMessages = useMemo(
    () => (selectedChatId ? messagesByChat[selectedChatId] ?? [] : []),
    [messagesByChat, selectedChatId],
  );
  const selectedMembers = useMemo(
    () => (selectedChatId ? membersByChat[selectedChatId] ?? [] : []),
    [membersByChat, selectedChatId],
  );
  const selectedCallMembers = useMemo(
    () => (selectedChatId ? callMembersByChat[selectedChatId] ?? [] : []),
    [callMembersByChat, selectedChatId],
  );
  const waitingCallCountsByChat = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(callMembersByChat).map(([chatId, members]) => [
          Number(chatId),
          members.filter((member) => member.id !== currentUser?.id).length,
        ]),
      ),
    [callMembersByChat, currentUser?.id],
  );
  const selectedRemoteCallMembers = useMemo(
    () => selectedCallMembers.filter((member) => member.id !== currentUser?.id),
    [currentUser?.id, selectedCallMembers],
  );
  const resolvedCurrentUser = useMemo(() => {
    if (!currentUser) {
      return null;
    }

    const knownUsers = [
      ...Object.values(membersByChat).flat(),
      ...Object.values(callMembersByChat).flat(),
      ...userSearchResults,
      ...groupInviteResults,
    ];
    const enriched = knownUsers.find(
      (user) => user.id === currentUser.id && (Boolean(user.avatar_url) || user.username !== currentUser.username),
    );

    if (!enriched) {
      return currentUser;
    }

    return {
      ...currentUser,
      username: enriched.username || currentUser.username,
      avatar_url: enriched.avatar_url || currentUser.avatar_url,
    };
  }, [callMembersByChat, currentUser, groupInviteResults, membersByChat, userSearchResults]);
  const chatDisplayById = useMemo(
    () =>
      Object.fromEntries(
        chats.map((chat) => [chat.id, getChatDisplay(chat, membersByChat[chat.id] ?? [], currentUser?.id)]),
      ),
    [chats, currentUser?.id, membersByChat],
  );
  const selectedChatDisplay = useMemo(
    () => (selectedChat ? chatDisplayById[selectedChat.id] ?? getChatDisplay(selectedChat, selectedMembers, currentUser?.id) : null),
    [chatDisplayById, currentUser?.id, selectedChat, selectedMembers],
  );
  const shouldShowCallPanel = Boolean(
    selectedChatId &&
    (activeCallChatId === selectedChatId || selectedRemoteCallMembers.length > 0),
  );
  const selectedWaitingCallCount = selectedChatId ? waitingCallCountsByChat[selectedChatId] ?? 0 : 0;
  const localScreenShareActive = useMemo(
    () => Boolean(localParticipantIdentity && screenShares[localParticipantIdentity]),
    [localParticipantIdentity, screenShares],
  );
  const isWatchingScreenShare = useMemo(
    () =>
      Boolean(
        primaryPaneMode === 'screen' &&
        selectedChat &&
        activeCallChatId === selectedChat.id &&
        watchingScreenShareIdentity &&
        screenShares[watchingScreenShareIdentity],
      ),
    [activeCallChatId, primaryPaneMode, screenShares, selectedChat, watchingScreenShareIdentity],
  );
  const showWsLoadingScreen = Boolean(currentUser) && !wsOnline;
  const watchingScreenShareName = useMemo(() => {
    if (!watchingScreenShareIdentity) {
      return null;
    }

    if (watchingScreenShareIdentity === localParticipantIdentity) {
      return resolvedCurrentUser?.username ?? 'Вы';
    }

    const participantId = Number(watchingScreenShareIdentity);
    if (participantId > 0) {
      const participant = selectedCallMembers.find((member) => member.id === participantId);
      if (participant) {
        return participant.username;
      }
    }

    return `Участник ${watchingScreenShareIdentity}`;
  }, [localParticipantIdentity, resolvedCurrentUser?.username, selectedCallMembers, watchingScreenShareIdentity]);
  const filteredChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) {
      return chats;
    }

    return chats.filter((chat) => (chatDisplayById[chat.id]?.name ?? chat.name).toLowerCase().includes(query));
  }, [chatDisplayById, chatSearch, chats]);
  const canEditSelectedGroup = selectedChat?.type === 'group';

  const mergeMembersPreservingAuthors = useCallback(
    (existingMembers: User[], nextMembers: User[], messages: Message[]) => {
      const authorIds = new Set(messages.map((message) => message.user_id));
      let mergedMembers = [...nextMembers];

      existingMembers.forEach((member) => {
        if (authorIds.has(member.id) && !mergedMembers.some((item) => item.id === member.id)) {
          mergedMembers = upsertUser(mergedMembers, member);
        }
      });

      return mergedMembers;
    },
    [],
  );

  const applyEntryVolume = useCallback((entry: LivekitAudioEntry, volumePercent: number) => {
    const normalized = Math.max(0, Math.min(volumePercent, 200)) / 100;
    if (entry.track.setVolume) {
      entry.track.setVolume(normalized);
      return;
    }

    entry.element.volume = Math.min(normalized, 1);
  }, []);

  const clearLivekitAudio = useCallback(() => {
    livekitAudioEntriesRef.current.forEach((entry) => {
      entry.track.detach?.(entry.element);
      entry.element.pause();
      entry.element.remove();
    });
    livekitAudioEntriesRef.current.clear();
    void livekitAudioContextRef.current?.close();
    livekitAudioContextRef.current = null;
  }, []);

  const clearLivekitScreenStage = useCallback(() => {
    livekitScreenStageTrackRef.current?.detach?.(livekitScreenStageElementRef.current ?? undefined);
    livekitScreenStageElementRef.current?.pause();
    livekitScreenStageElementRef.current?.remove();
    livekitScreenStageTrackRef.current = null;
    livekitScreenStageElementRef.current = null;
    if (livekitScreenStageRef.current) {
      livekitScreenStageRef.current.innerHTML = '';
    }
  }, []);

  const registerScreenShare = useCallback((participantIdentity: string, isLocal: boolean, track?: LivekitVideoTrack) => {
    if (!participantIdentity) {
      return;
    }

    if (track) {
      livekitScreenEntriesRef.current.forEach((entry, key) => {
        if (entry.participantIdentity === participantIdentity && entry.track !== track) {
          livekitScreenEntriesRef.current.delete(key);
        }
      });
      livekitScreenEntriesRef.current.set(track.sid ?? `${participantIdentity}-${SCREEN_SHARE_SOURCE}`, {
        participantIdentity,
        isLocal,
        track,
      });
    }

    setScreenShares((current) => {
      if (current[participantIdentity]?.isLocal === isLocal) {
        return current;
      }

      return {
        ...current,
        [participantIdentity]: { isLocal },
      };
    });
    setScreenShareVersion((current) => current + 1);
  }, []);

  const unregisterScreenShare = useCallback(
    (participantIdentity: string) => {
      if (!participantIdentity) {
        return;
      }

      let removed = false;
      livekitScreenEntriesRef.current.forEach((entry, key) => {
        if (entry.participantIdentity === participantIdentity) {
          removed = true;
          livekitScreenEntriesRef.current.delete(key);
        }
      });

      if (watchingScreenShareIdentity === participantIdentity) {
        clearLivekitScreenStage();
      }

      setScreenShares((current) => {
        if (!(participantIdentity in current)) {
          return current;
        }

        const next = { ...current };
        delete next[participantIdentity];
        return next;
      });

      if (removed || watchingScreenShareIdentity === participantIdentity) {
        setScreenShareVersion((current) => current + 1);
      }
    },
    [clearLivekitScreenStage, watchingScreenShareIdentity],
  );

  const clearLivekitScreenShares = useCallback(() => {
    clearLivekitScreenStage();
    livekitScreenEntriesRef.current.clear();
    setScreenShares({});
    setWatchingScreenShareIdentity(null);
    setPrimaryPaneMode('chat');
    setLocalParticipantIdentity(null);
    setScreenShareBusy(false);
    setScreenShareVersion((current) => current + 1);
  }, [clearLivekitScreenStage]);

  const disconnectLivekit = useCallback(() => {
    livekitRoomRef.current?.disconnect();
    livekitRoomRef.current = null;
    clearLivekitAudio();
    clearLivekitScreenShares();
  }, [clearLivekitAudio, clearLivekitScreenShares]);

  const sendSocketEvent = useCallback((payload: SocketEnvelope) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    socket.send(JSON.stringify(payload));
  }, []);

  const sendDemoSocketEvent = useCallback(
    (eventName: 'call.demo.run' | 'call.demo.stop', chatId: number) => {
      if (!chatId) {
        return;
      }

      try {
        sendSocketEvent({ event: eventName, chat_id: chatId, data: {} });
      } catch (error) {
        setCallError(error instanceof Error ? error.message : 'Не удалось отправить событие демонстрации');
      }
    },
    [sendSocketEvent],
  );

  const loadCurrentUser = useCallback(async () => {
    try {
      const user = await api.me();
      setCurrentUser(user);
      setAppError(null);
      return user;
    } catch {
      setCurrentUser(null);
      return null;
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  const loadChats = useCallback(
    async () => {
      const nextChats = await api.listChats();
      const memberEntries = await Promise.all(
        nextChats.map(async (chat) => {
          try {
            const members = await api.getChatMembers(chat.id);
            return [chat.id, members] as const;
          } catch {
            return [chat.id, null] as const;
          }
        }),
      );

      setChats(nextChats);
      setMembersByChat((current) => {
        const next = { ...current };
        memberEntries.forEach(([chatId, members]) => {
          if (members) {
            next[chatId] = mergeMembersPreservingAuthors(current[chatId] ?? [], members, messagesByChat[chatId] ?? []);
          }
        });
        return next;
      });
      setSelectedChatId((current) => {
        if (current && nextChats.some((chat) => chat.id === current)) {
          return current;
        }
        return nextChats[0]?.id ?? null;
      });
    },
    [mergeMembersPreservingAuthors, messagesByChat],
  );

  const loadChatContext = useCallback(async (chatId: number) => {
    setLoadingChatId(chatId);
    try {
      const [messages, members] = await Promise.all([
        api.listMessages(chatId),
        api.getChatMembers(chatId),
      ]);
      setMessagesByChat((current) => ({
        ...current,
        [chatId]: sortMessages(messages),
      }));
      setMembersByChat((current) => ({
        ...current,
        [chatId]: mergeMembersPreservingAuthors(current[chatId] ?? [], members, messages),
      }));
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Не удалось загрузить чат');
    } finally {
      setLoadingChatId((current) => (current === chatId ? null : current));
    }
  }, [mergeMembersPreservingAuthors]);

  const loadCallMembers = useCallback(async (chatId: number, options?: { silent?: boolean; }) => {
    try {
      const members = await api.currentCallMembers();
      setCallMembersByChat((current) => ({
        ...current,
        [chatId]: members,
      }));
      return members;
    } catch (error) {
      if (!options?.silent) {
        setCallError(error instanceof Error ? error.message : 'Не удалось загрузить участников комнаты');
      }
      return [];
    }
  }, []);

  const connectLivekit = useCallback(
    async (chatId: number) => {
      if (!LIVEKIT_URL) {
        setCallError('VITE_LIVEKIT_URL is not configured');
        return;
      }

      disconnectLivekit();
      try {
        const { Room: LivekitRoom, RoomEvent, Track } = await import('livekit-client');
        const roomName = buildCallRoomName(chatId);
        const { token } = await api.getCallToken(roomName);
        if (!livekitAudioContextRef.current || livekitAudioContextRef.current.state === 'closed') {
          livekitAudioContextRef.current = new AudioContext();
        }
        if (livekitAudioContextRef.current.state === 'suspended') {
          await livekitAudioContextRef.current.resume();
        }

        const room = new LivekitRoom({
          webAudioMix: {
            audioContext: livekitAudioContextRef.current,
          },
        });
        const attachAudioTrack = async (
          track: { kind?: string; attach: () => HTMLMediaElement; detach: () => HTMLMediaElement[]; sid?: string; setVolume?: (volume: number) => void; },
          participantIdentity?: string,
        ) => {
          if (track.kind !== Track.Kind.Audio) {
            return;
          }

          const trackKey = track.sid ?? crypto.randomUUID();
          const existing = livekitAudioEntriesRef.current.get(trackKey);
          if (existing) {
            existing.track.detach?.(existing.element);
            existing.element.pause();
            existing.element.remove();
          }

          const element = track.attach();
          element.autoplay = true;
          livekitAudioSinkRef.current?.appendChild(element);

          const entry: LivekitAudioEntry = {
            element,
            track,
            participantIdentity,
          };
          const participantId = Number(participantIdentity ?? 0);
          const volume = participantId > 0 ? callVolumes[participantId] ?? DEFAULT_REMOTE_VOLUME : DEFAULT_REMOTE_VOLUME;
          applyEntryVolume(entry, volume);
          livekitAudioEntriesRef.current.set(trackKey, entry);
        };
        const detachAudioTrack = (track: { detach: () => HTMLMediaElement[]; sid?: string; }) => {
          const trackKey = track.sid;
          const existing = trackKey ? livekitAudioEntriesRef.current.get(trackKey) : null;
          if (existing && trackKey) {
            existing.track.detach?.(existing.element);
            existing.element.pause();
            existing.element.remove();
            livekitAudioEntriesRef.current.delete(trackKey);
          }

          track.detach().forEach((element) => element.remove());
        };

        const attachScreenTrack = (
          track: LivekitVideoTrack | undefined,
          participantIdentity?: string,
          isLocal = false,
          source?: string,
        ) => {
          if (!track || !participantIdentity) {
            return;
          }

          const resolvedSource = source ?? track.source;
          if (track.kind !== Track.Kind.Video || resolvedSource !== Track.Source.ScreenShare) {
            return;
          }

          registerScreenShare(participantIdentity, isLocal, track);
        };

        room.on(RoomEvent.TrackPublished, (publication, participant) => {
          if (publication.source === Track.Source.ScreenShare) {
            registerScreenShare(participant.identity, false);
          }
        });
        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          void attachAudioTrack(track, participant.identity);
          attachScreenTrack(track as LivekitVideoTrack, participant.identity, false, publication.source);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          if (publication.source === Track.Source.ScreenShare) {
            unregisterScreenShare(participant.identity);
            return;
          }

          detachAudioTrack(track);
        });
        room.on(RoomEvent.TrackUnpublished, (publication, participant) => {
          if (publication.source === Track.Source.ScreenShare) {
            unregisterScreenShare(participant.identity);
          }
        });
        room.on(RoomEvent.LocalTrackPublished, (publication, participant) => {
          if (publication.source === Track.Source.ScreenShare) {
            attachScreenTrack(publication.track as LivekitVideoTrack | undefined, participant.identity, true, publication.source);
            sendDemoSocketEvent('call.demo.run', chatId);
          }
        });
        room.on(RoomEvent.LocalTrackUnpublished, (publication, participant) => {
          if (publication.source === Track.Source.ScreenShare) {
            unregisterScreenShare(participant.identity);
            sendDemoSocketEvent('call.demo.stop', chatId);
          }
        });
        room.on(RoomEvent.Disconnected, () => {
          clearLivekitAudio();
          clearLivekitScreenShares();
        });

        livekitRoomRef.current = room;
        await room.connect(LIVEKIT_URL, token);
        setLocalParticipantIdentity(room.localParticipant.identity);
        await room.localParticipant.setMicrophoneEnabled(true, AUDIO_CAPTURE_OPTIONS);
        setSelfMuted(false);
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((publication) => {
            if (publication.track && publication.track.kind === Track.Kind.Audio) {
              void attachAudioTrack(publication.track, participant.identity);
            }
            if (publication.source === Track.Source.ScreenShare) {
              attachScreenTrack(publication.track as LivekitVideoTrack | undefined, participant.identity, false, publication.source);
            }
          });
        });
        setCallError(null);
      } catch (error) {
        setCallError(error instanceof Error ? error.message : 'LiveKit connection failed');
      }
    },
    [
      applyEntryVolume,
      callVolumes,
      clearLivekitAudio,
      clearLivekitScreenShares,
      disconnectLivekit,
      registerScreenShare,
      sendDemoSocketEvent,
      unregisterScreenShare,
    ],
  );

  const refreshCallState = useCallback(
    async (chatId: number) => {
      setActiveCallChatId(chatId);
      if (currentUser) {
        setCallMembersByChat((state) => ({
          ...state,
          [chatId]: upsertUser(state[chatId] ?? [], currentUser),
        }));
      }
      await connectLivekit(chatId);
      void loadCallMembers(chatId, { silent: true });
    },
    [connectLivekit, currentUser, loadCallMembers],
  );

  const dismissInvite = useCallback((inviteId: string) => {
    setInvites((current) => current.filter((invite) => invite.id !== inviteId));
  }, []);

  const dismissErrorToast = useCallback((toastId: string) => {
    setErrorToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const pushInvite = useCallback((invite: Omit<InviteToast, 'id' | 'expiresAt' | 'ttlMs'>) => {
    setInvites((current) => {
      const duplicate = current.find(
        (item) => item.kind === invite.kind && item.chatId === invite.chatId && item.inviterName === invite.inviterName,
      );
      if (duplicate) {
        return current;
      }

      return [
        {
          ...invite,
          id: crypto.randomUUID(),
          ttlMs: INVITE_TTL_MS,
          expiresAt: Date.now() + INVITE_TTL_MS,
        },
        ...current,
      ];
    });
  }, []);

  const pushErrorToast = useCallback((message: string) => {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) {
      return;
    }

    setErrorToasts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        message: normalizedMessage,
        ttlMs: ERROR_TTL_MS,
        expiresAt: Date.now() + ERROR_TTL_MS,
        pinned: false,
        expanded: false,
      },
    ]);
  }, []);

  const toggleErrorToastExpanded = useCallback((toastId: string) => {
    setErrorToasts((current) =>
      current.map((toast) =>
        toast.id === toastId
          ? {
            ...toast,
            expanded: !toast.expanded,
            pinned: true,
          }
          : toast,
      ),
    );
  }, []);

  const handleSocketEvent = useCallback(
    async (payload: unknown) => {
      if (typeof payload !== 'string') {
        return;
      }

      if (payload === 'ping') {
        wsRef.current?.send('pong');
        return;
      }

      let event: SocketEnvelope;
      try {
        event = JSON.parse(payload) as SocketEnvelope;
      } catch {
        return;
      }

      if (typeof event.event !== 'string') {
        return;
      }

      if (event.event === 'ping') {
        wsRef.current?.send(JSON.stringify({ event: 'pong' }));
        return;
      }

      const data = asRecord(event.data);
      const eventRecord = asRecord(event);
      const chatId = Number(data.chat_id ?? data.ChatID ?? event.chat_id ?? eventRecord.ChatID ?? 0) || null;
      const callJoinChatId =
        Number(data.chat_id ?? data.ChatID ?? event.chat_id ?? eventRecord.ChatID ?? selectedChatId ?? activeCallChatId ?? 0) || null;
      const callLeaveChatId = Number(data.chat_id ?? data.ChatID ?? event.chat_id ?? eventRecord.ChatID ?? 0) || null;

      switch (event.event) {
        case 'chat.message.created': {
          const message = normalizeMessage({
            ...data,
            chat_id: data.chat_id ?? data.ChatID ?? event.chat_id ?? eventRecord.ChatID,
          });
          if (!message.chat_id) {
            break;
          }
          setMessagesByChat((current) => ({
            ...current,
            [message.chat_id]: upsertMessage(current[message.chat_id] ?? [], message),
          }));
          break;
        }
        case 'chat.message.updated': {
          const message = normalizeMessage({
            ...data,
            chat_id: data.chat_id ?? data.ChatID ?? event.chat_id ?? eventRecord.ChatID,
          });
          if (!message.chat_id) {
            break;
          }
          setMessagesByChat((current) => ({
            ...current,
            [message.chat_id]: upsertMessage(current[message.chat_id] ?? [], message),
          }));
          break;
        }
        case 'chat.message.deleted': {
          const messageId = Number(data.id ?? data.message_id ?? data.MessageID ?? 0);
          if (!messageId || !chatId) {
            break;
          }
          setMessagesByChat((current) => ({
            ...current,
            [chatId]: removeMessage(current[chatId] ?? [], messageId),
          }));
          break;
        }
        case 'chat.group.updated': {
          const chat = normalizeChat(data);
          if (!chat.id) {
            break;
          }
          setChats((current) => upsertChat(current, chat));
          break;
        }
        case 'chat.deleted': {
          if (!chatId) {
            break;
          }
          setChats((current) => current.filter((chat) => chat.id !== chatId));
          setSelectedChatId((current) => (current === chatId ? null : current));
          break;
        }
        case 'chat.user.invited':
        case 'chat.invite':
        case 'chat.group.invited': {
          pushInvite({
            kind: 'chat',
            chatId,
            chatName: String(data.chat_name ?? data.name ?? `Chat ${chatId ?? ''}`),
            inviterName: String(data.username ?? data.inviter_username ?? 'Someone'),
            avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : null,
            code: typeof data.code === 'string' ? data.code : undefined,
          });
          break;
        }
        case 'chat.group.joined':
        case 'chat.private.user.joined':
        case 'chat.user.leave': {
          void loadChats();
          if (chatId) {
            void loadChatContext(chatId);
          }
          break;
        }
        case 'call.join': {
          if (!callJoinChatId) {
            break;
          }

          const user = normalizeUser('user' in data ? data.user : data);
          if (user.id > 0) {
            setCallMembersByChat((current) => ({
              ...current,
              [callJoinChatId]: upsertUser(current[callJoinChatId] ?? [], user),
            }));
          }

          if (activeCallChatId === callJoinChatId) {
            void loadCallMembers(callJoinChatId);
          }
          break;
        }
        case 'call.demo.run': {
          if (!chatId) {
            break;
          }

          const userId = Number(data.user_id ?? data.UserID ?? data.id ?? 0);
          if (userId > 0) {
            registerScreenShare(String(userId), false);
          }
          break;
        }
        case 'call.demo.stop': {
          const userId = Number(data.user_id ?? data.UserID ?? data.id ?? 0);
          if (userId > 0) {
            unregisterScreenShare(String(userId));
          }
          break;
        }
        case 'call.leave':
        case 'chat.leave': {
          if (!callLeaveChatId) {
            break;
          }

          const userId = Number(data.user_id ?? data.UserID ?? data.client_id ?? data.id ?? 0);
          if (userId > 0) {
            setCallMembersByChat((current) => ({
              ...current,
              [callLeaveChatId]: removeUser(current[callLeaveChatId] ?? [], userId),
            }));
          }

          if (activeCallChatId === callLeaveChatId) {
            void loadCallMembers(callLeaveChatId);
          }
          break;
        }
        case 'error': {
          setAppError(String(data.message ?? 'Socket error'));
          break;
        }
        default:
          break;
      }
    },
    [activeCallChatId, loadCallMembers, loadChatContext, loadChats, registerScreenShare, unregisterScreenShare],
  );

  socketHandlerRef.current = handleSocketEvent;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setInvites((current) => current.filter((invite) => invite.expiresAt > Date.now()));
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setErrorToasts((current) => current.filter((toast) => toast.pinned || toast.expiresAt > Date.now()));
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!appError) {
      return;
    }

    pushErrorToast(appError);
    setAppError(null);
  }, [appError, pushErrorToast]);

  useEffect(() => {
    if (!callError) {
      return;
    }

    pushErrorToast(callError);
    setCallError(null);
  }, [callError, pushErrorToast]);

  useEffect(() => {
    if (watchingScreenShareIdentity && !screenShares[watchingScreenShareIdentity]) {
      setWatchingScreenShareIdentity(null);
      setPrimaryPaneMode('chat');
    }
  }, [screenShares, watchingScreenShareIdentity]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const shell = livekitScreenShellRef.current;
      setScreenShareFullscreen(Boolean(shell && document.fullscreenElement === shell));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (isWatchingScreenShare) {
      return;
    }

    if (document.fullscreenElement === livekitScreenShellRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [isWatchingScreenShare]);

  useEffect(() => {
    clearLivekitScreenStage();

    if (!isWatchingScreenShare || !watchingScreenShareIdentity) {
      return;
    }

    const entry = Array.from(livekitScreenEntriesRef.current.values()).find(
      (item) => item.participantIdentity === watchingScreenShareIdentity,
    );
    const stage = livekitScreenStageRef.current;
    if (!entry || !stage) {
      return;
    }

    const element = entry.track.attach();
    element.autoplay = true;
    element.classList.add('screen-share-stage__media');

    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
      element.muted = entry.isLocal;
    }

    stage.appendChild(element);
    livekitScreenStageTrackRef.current = entry.track;
    livekitScreenStageElementRef.current = element;

    return () => {
      entry.track.detach?.(element);
      element.pause();
      element.remove();
      if (livekitScreenStageTrackRef.current === entry.track) {
        livekitScreenStageTrackRef.current = null;
        livekitScreenStageElementRef.current = null;
      }
    };
  }, [clearLivekitScreenStage, isWatchingScreenShare, screenShareVersion, watchingScreenShareIdentity]);

  useEffect(() => {
    void loadCurrentUser();
    return () => {
      disconnectLivekit();
    };
  }, [disconnectLivekit, loadCurrentUser]);

  useEffect(() => {
    if (!groupEditOpen || !selectedChat || selectedChat.type !== 'group') {
      return;
    }

    setGroupEditName(selectedChat.name);
  }, [groupEditOpen, selectedChat]);

  useEffect(() => {
    if (!groupEditFile) {
      setGroupEditPreview(undefined);
      return;
    }

    const previewUrl = URL.createObjectURL(groupEditFile);
    setGroupEditPreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [groupEditFile]);

  useEffect(() => {
    if (!profileSettingsOpen || !currentUser) {
      return;
    }

    setProfileName(currentUser.username);
  }, [currentUser, profileSettingsOpen]);

  useEffect(() => {
    if (!profileFile) {
      setProfilePreview(undefined);
      return;
    }

    const previewUrl = URL.createObjectURL(profileFile);
    setProfilePreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [profileFile]);

  useEffect(() => {
    setCallVolumes((current) => {
      const next: Record<number, number> = {};
      selectedCallMembers.forEach((member) => {
        if (member.id === currentUser?.id) {
          return;
        }
        next[member.id] = current[member.id] ?? DEFAULT_REMOTE_VOLUME;
      });
      return next;
    });
  }, [currentUser?.id, selectedCallMembers]);

  useEffect(() => {
    livekitAudioEntriesRef.current.forEach((entry) => {
      const participantId = Number(entry.participantIdentity ?? 0);
      const volume = participantId > 0 ? callVolumes[participantId] ?? DEFAULT_REMOTE_VOLUME : DEFAULT_REMOTE_VOLUME;
      applyEntryVolume(entry, volume);
    });

    const room = livekitRoomRef.current;
    if (!room) {
      return;
    }

    Object.entries(callVolumes).forEach(([userId, volumePercent]) => {
      const participant = room.remoteParticipants.get(userId);
      if (!participant) {
        return;
      }

      const normalized = Math.max(0, Math.min(volumePercent, 200)) / 100;
      participant.setVolume(normalized);
    });
  }, [applyEntryVolume, callVolumes]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    void loadChats();
  }, [currentUser, loadChats]);

  useEffect(() => {
    if (!selectedChatId || !currentUser) {
      return;
    }

    if (!messagesByChat[selectedChatId] || !membersByChat[selectedChatId]) {
      void loadChatContext(selectedChatId);
    }
  }, [currentUser, loadChatContext, membersByChat, messagesByChat, selectedChatId]);

  useEffect(() => {
    setEditingMessageId(null);
    setEditingMessageText('');
    setMessageActionBusy(false);
  }, [selectedChatId]);

  useEffect(() => {
    if (!userSearchOpen) {
      setUserSearchQuery('');
      setUserSearchResults([]);
      setUserSearchError(null);
      setUserSearchBusy(false);
      return;
    }

    if (!userSearchQuery.trim()) {
      setUserSearchResults([]);
      setUserSearchError(null);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setUserSearchBusy(true);
      setUserSearchError(null);
      try {
        const users = await api.searchUsers(userSearchQuery.trim());
        setUserSearchResults(users.filter((user) => user.id !== currentUser?.id));
      } catch (error) {
        setUserSearchError(error instanceof Error ? error.message : 'Не удалось найти пользователей');
      } finally {
        setUserSearchBusy(false);
      }
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [currentUser?.id, userSearchOpen, userSearchQuery]);

  useEffect(() => {
    if (!groupInviteOpen) {
      setGroupInviteQuery('');
      setGroupInviteResults([]);
      setGroupInviteError(null);
      setGroupInviteBusy(false);
      return;
    }

    if (!selectedChat || selectedChat.type !== 'group') {
      return;
    }

    const timeout = window.setTimeout(async () => {
      setGroupInviteBusy(true);
      setGroupInviteError(null);
      try {
        const users = await api.getChatNonMembers(selectedChat.id);
        const query = groupInviteQuery.trim().toLowerCase();
        const filtered = query
          ? users.filter((user) => user.username.toLowerCase().includes(query))
          : users;
        setGroupInviteResults(filtered.filter((user) => user.id !== currentUser?.id));
      } catch (error) {
        setGroupInviteError(error instanceof Error ? error.message : 'Не удалось загрузить пользователей');
      } finally {
        setGroupInviteBusy(false);
      }
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [currentUser?.id, groupInviteOpen, groupInviteQuery, selectedChat]);

  useLayoutEffect(() => {
    const chatBody = chatBodyRef.current;
    if (!chatBody || !selectedChatId || loadingChatId === selectedChatId) {
      return;
    }

    const chatChanged = lastAutoScrolledChatRef.current !== selectedChatId;
    const messageCountIncreased = selectedMessages.length > lastMessageCountRef.current;

    if (chatChanged || (messageCountIncreased && wasNearBottomRef.current)) {
      chatBody.scrollTop = chatBody.scrollHeight;
      wasNearBottomRef.current = true;
    }

    lastAutoScrolledChatRef.current = selectedChatId;
    lastMessageCountRef.current = selectedMessages.length;
  }, [loadingChatId, selectedChatId, selectedMessages.length]);

  useEffect(() => {
    if (!currentUser) {
      setWsOnline(false);
      return;
    }

    let cancelled = false;
    let activeSocket: WebSocket | null = null;

    const connect = () => {
      if (cancelled) {
        return;
      }

      const socket = new WebSocket(`${WS_BASE}`);
      activeSocket = socket;
      wsRef.current = socket;
      setWsOnline(false);

      socket.onopen = () => {
        if (!cancelled) {
          console.log('[ws] connected');
          setWsOnline(true);
        }
      };
      socket.onmessage = (event) => {
        console.log('[ws] message', event.data);
        socketHandlerRef.current(event.data);
      };
      socket.onerror = () => {
        if (!cancelled) {
          setWsOnline(false);
        }
      };
      socket.onclose = () => {
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
        if (activeSocket === socket) {
          activeSocket = null;
        }
        if (!cancelled) {
          console.log('[ws] disconnected');
          setWsOnline(false);
          reconnectRef.current = window.setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (wsRef.current === activeSocket) {
        wsRef.current = null;
      }
      activeSocket?.close();
      activeSocket = null;
    };
  }, [currentUser?.id]);

  async function handleLogin(payload: LoginPayload) {
    const username = payload.username.trim();
    if (username.length < 1 || username.length > 20) {
      setLoginError('Логин должен содержать от 1 до 20 символов');
      return;
    }

    setLoginBusy(true);
    setLoginError(null);
    try {
      await api.login({ ...payload, username });
      const user = await loadCurrentUser();
      if (user) {
        await loadChats();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setLoginError('Неверный логин или пароль');
      } else {
        setLoginError(error instanceof Error ? error.message : 'Не удалось войти');
      }
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleCreateGroup() {
    const name = window.prompt('Название группы');
    if (!name?.trim()) {
      return;
    }

    setCreateGroupBusy(true);
    try {
      const chat = await api.createGroup(name.trim());
      setChats((current) => upsertChat(current, chat));
      setSelectedChatId(chat.id);
      await loadChatContext(chat.id);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Не удалось создать группу');
    } finally {
      setCreateGroupBusy(false);
    }
  }

  async function handleSendMessage() {
    if (!selectedChatId) {
      return;
    }

    try {
      const message = await api.sendMessage(selectedChatId, {
        content: composerText.trim(),
        files: composerFiles,
      });
      setMessagesByChat((current) => ({
        ...current,
        [selectedChatId]: upsertMessage(current[selectedChatId] ?? [], message),
      }));
      setComposerText('');
      setComposerFiles([]);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Не удалось отправить сообщение');
    }
  }

  function handleStartEditMessage(message: Message) {
    setEditingMessageId(message.id);
    setEditingMessageText(message.content);
  }

  function handleCancelEditMessage() {
    setEditingMessageId(null);
    setEditingMessageText('');
  }

  async function handleSaveEditMessage() {
    if (!selectedChatId || !editingMessageId) {
      return;
    }

    setMessageActionBusy(true);
    try {
      const updatedMessage = await api.updateMessage(editingMessageId, editingMessageText.trim());
      setMessagesByChat((current) => ({
        ...current,
        [selectedChatId]: upsertMessage(current[selectedChatId] ?? [], updatedMessage),
      }));
      setEditingMessageId(null);
      setEditingMessageText('');
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Не удалось обновить сообщение');
    } finally {
      setMessageActionBusy(false);
    }
  }

  async function handleDeleteMessage(message: Message) {
    if (!selectedChatId) {
      return;
    }

    const confirmed = window.confirm('Удалить это сообщение?');
    if (!confirmed) {
      return;
    }

    setMessageActionBusy(true);
    try {
      await api.deleteMessage(message.id);
      setMessagesByChat((current) => ({
        ...current,
        [selectedChatId]: removeMessage(current[selectedChatId] ?? [], message.id),
      }));
      if (editingMessageId === message.id) {
        setEditingMessageId(null);
        setEditingMessageText('');
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Не удалось удалить сообщение');
    } finally {
      setMessageActionBusy(false);
    }
  }

  async function startCall(chatId: number) {
    setCallBusy(true);
    setCallError(null);
    try {
      sendSocketEvent({ event: 'call.join', chat_id: chatId, data: {} });
      await refreshCallState(chatId);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Не удалось войти в комнату');
    } finally {
      setCallBusy(false);
    }
  }

  async function leaveCall() {
    if (!activeCallChatId) {
      return;
    }

    const chatId = activeCallChatId;

    try {
      sendSocketEvent({ event: 'call.leave', chat_id: chatId, data: {} });
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Не удалось выйти из комнаты');
    }

    if (currentUser?.id) {
      setCallMembersByChat((current) => ({
        ...current,
        [chatId]: removeUser(current[chatId] ?? [], currentUser.id),
      }));
    }

    disconnectLivekit();
    setActiveCallChatId(null);
    setCallVolumes({});
    setSelfMuted(false);
  }

  async function toggleSelfMute() {
    const room = livekitRoomRef.current;
    if (!room) {
      return;
    }

    const nextMuted = !selfMuted;
    setMuteBusy(true);
    setCallError(null);
    try {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted, nextMuted ? undefined : AUDIO_CAPTURE_OPTIONS);
      setSelfMuted(nextMuted);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Не удалось изменить состояние микрофона');
    } finally {
      setMuteBusy(false);
    }
  }

  async function toggleScreenShare() {
    const room = livekitRoomRef.current;
    if (!room) {
      setCallError('Сначала подключитесь к комнате');
      return;
    }

    const nextEnabled = !localScreenShareActive;
    setScreenShareBusy(true);
    setCallError(null);
    try {
      const { Track } = await import('livekit-client');
      await room.localParticipant.setScreenShareEnabled(nextEnabled, {
        audio: true,
      });

      if (!nextEnabled) {
        if (room.localParticipant.identity) {
          unregisterScreenShare(room.localParticipant.identity);
        }
        if (watchingScreenShareIdentity === room.localParticipant.identity) {
          setPrimaryPaneMode('chat');
        }
      } else {
        const publication = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (publication?.track && room.localParticipant.identity) {
          registerScreenShare(
            room.localParticipant.identity,
            true,
            publication.track as LivekitVideoTrack,
          );
        }
      }
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Не удалось запустить демонстрацию экрана');
    } finally {
      setScreenShareBusy(false);
    }
  }

  function handleCallVolumeChange(userId: number, nextVolume: number) {
    setCallVolumes((current) => ({
      ...current,
      [userId]: Math.max(0, Math.min(nextVolume, 200)),
    }));
  }

  function leaveScreenShareView() {
    setPrimaryPaneMode('chat');
  }

  async function toggleScreenShareFullscreen() {
    const shell = livekitScreenShellRef.current;
    if (!shell) {
      return;
    }

    try {
      if (document.fullscreenElement === shell) {
        await document.exitFullscreen();
        return;
      }

      await shell.requestFullscreen();
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Не удалось переключить полноэкранный режим');
    }
  }

  async function handleLeaveChat() {
    if (!selectedChat) {
      return;
    }

    const confirmed = window.confirm(
      selectedChat.type === 'group'
        ? 'Покинуть этот групповой чат?'
        : 'Покинуть этот личный чат?',
    );
    if (!confirmed) {
      return;
    }

    setLeaveChatBusy(true);
    setAppError(null);
    try {
      if (activeCallChatId === selectedChat.id) {
        await leaveCall();
      }

      await api.leaveChat(selectedChat.id);
      setChats((current) => current.filter((chat) => chat.id !== selectedChat.id));
      setSelectedChatId((current) => (current === selectedChat.id ? null : current));
      setMessagesByChat((current) => {
        const next = { ...current };
        delete next[selectedChat.id];
        return next;
      });
      setMembersByChat((current) => {
        const next = { ...current };
        delete next[selectedChat.id];
        return next;
      });
      setCallMembersByChat((current) => {
        const next = { ...current };
        delete next[selectedChat.id];
        return next;
      });
      await loadChats();
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Не удалось покинуть чат');
    } finally {
      setLeaveChatBusy(false);
    }
  }

  async function acceptInvite(invite: InviteToast) {
    try {
      if (invite.kind === 'chat') {
        if (!invite.code) {
          throw new Error('Отсутствует код приглашения');
        }
        await api.acceptChatInvite(invite.code);
        await loadChats();
        if (invite.chatId) {
          setSelectedChatId(invite.chatId);
          await loadChatContext(invite.chatId);
        }
      } else if (invite.chatId) {
        sendSocketEvent({ event: 'call.join', chat_id: invite.chatId, data: {} });
        setSelectedChatId(invite.chatId);
        await loadChatContext(invite.chatId);
        await refreshCallState(invite.chatId);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) {
        setAppError('Срок действия приглашения в группу истёк');
      } else {
        setAppError(error instanceof Error ? error.message : 'Не удалось принять приглашение');
      }
    } finally {
      dismissInvite(invite.id);
    }
  }

  function declineInvite(invite: InviteToast) {
    dismissInvite(invite.id);
  }

  async function handleAddUser(user: User) {
    setAddUserBusyId(user.id);
    setUserSearchError(null);
    try {
      const chat = await api.createPrivate(user.id);
      setChats((current) => upsertChat(current, chat));
      setSelectedChatId(chat.id);
      setUserSearchOpen(false);
      await loadChatContext(chat.id);
    } catch (error) {
      setUserSearchError(error instanceof Error ? error.message : 'Не удалось создать личный чат');
    } finally {
      setAddUserBusyId(null);
    }
  }

  async function handleInviteUser(user: User) {
    if (!selectedChat || selectedChat.type !== 'group') {
      return;
    }

    setInviteUserBusyId(user.id);
    setGroupInviteError(null);
    try {
      await api.inviteToChat(selectedChat.id, user.id);
      setGroupInviteResults((current) => current.filter((item) => item.id !== user.id));
      await loadChatContext(selectedChat.id);
    } catch (error) {
      setGroupInviteError(error instanceof Error ? error.message : 'Не удалось пригласить пользователя');
    } finally {
      setInviteUserBusyId(null);
    }
  }

  function handleChatBodyScroll(event: React.UIEvent<HTMLElement>) {
    const element = event.currentTarget;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    wasNearBottomRef.current = distanceFromBottom < 120;
  }

  function openGroupEdit() {
    if (!selectedChat || selectedChat.type !== 'group') {
      return;
    }

    setGroupEditName(selectedChat.name);
    setGroupEditFile(null);
    setGroupEditPreview(undefined);
    setGroupEditError(null);
    setGroupEditOpen(true);
  }

  function openProfileSettings() {
    if (!currentUser) {
      return;
    }

    setProfileName(currentUser.username);
    setProfileFile(null);
    setProfilePreview(undefined);
    setProfileError(null);
    setProfileSettingsOpen(true);
  }

  function closeGroupEdit() {
    if (groupEditBusy) {
      return;
    }

    setGroupEditOpen(false);
    setGroupEditFile(null);
    setGroupEditPreview(undefined);
    setGroupEditError(null);
  }

  function closeProfileSettings() {
    if (profileBusy) {
      return;
    }

    setProfileSettingsOpen(false);
    setProfileFile(null);
    setProfilePreview(undefined);
    setProfileError(null);
  }

  function syncCurrentUser(nextUser: User) {
    setCurrentUser(nextUser);
    setMembersByChat((current) =>
      Object.fromEntries(
        Object.entries(current).map(([chatId, members]) => [
          Number(chatId),
          members.some((member) => member.id === nextUser.id) ? upsertUser(members, nextUser) : members,
        ]),
      ),
    );
    setCallMembersByChat((current) =>
      Object.fromEntries(
        Object.entries(current).map(([chatId, members]) => [
          Number(chatId),
          members.some((member) => member.id === nextUser.id) ? upsertUser(members, nextUser) : members,
        ]),
      ),
    );
  }

  async function submitGroupEdit() {
    if (!selectedChat || selectedChat.type !== 'group') {
      return;
    }

    setGroupEditBusy(true);
    setGroupEditError(null);
    try {
      const updatedChat = await api.updateChat(selectedChat.id, {
        name: groupEditName.trim(),
        file: groupEditFile,
      });
      setChats((current) => upsertChat(current, updatedChat));
      setGroupEditOpen(false);
      setGroupEditFile(null);
      setGroupEditPreview(undefined);
    } catch (error) {
      setGroupEditError(error instanceof Error ? error.message : 'Не удалось обновить группу');
    } finally {
      setGroupEditBusy(false);
    }
  }

  async function submitProfileSettings() {
    if (!currentUser) {
      return;
    }

    setProfileBusy(true);
    setProfileError(null);
    try {
      const updatedUser = await api.updateMe({
        username: profileName.trim(),
        file: profileFile,
      });
      syncCurrentUser(updatedUser);
      setProfileSettingsOpen(false);
      setProfileFile(null);
      setProfilePreview(undefined);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Не удалось обновить профиль');
    } finally {
      setProfileBusy(false);
    }
  }

  async function handleLogout() {
    setProfileBusy(true);
    setProfileError(null);
    try {
      if (activeCallChatId) {
        try {
          sendSocketEvent({ event: 'call.leave', chat_id: activeCallChatId, data: {} });
        } catch {
          // Ignore socket failures during local logout.
        }
      }

      await api.logout();
      disconnectLivekit();
      setInvites([]);
      setChats([]);
      setChatSearch('');
      setSelectedChatId(null);
      setMessagesByChat({});
      setMembersByChat({});
      setComposerText('');
      setComposerFiles([]);
      setEditingMessageId(null);
      setEditingMessageText('');
      setCallMembersByChat({});
      setCallVolumes({});
      setCallError(null);
      setActiveCallChatId(null);
      setSelfMuted(false);
      setGroupEditOpen(false);
      setGroupEditFile(null);
      setGroupEditPreview(undefined);
      setUserSearchOpen(false);
      setGroupInviteOpen(false);
      setProfileSettingsOpen(false);
      setProfileFile(null);
      setProfilePreview(undefined);
      setAppError(null);
      setCurrentUser(null);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Не удалось выйти из аккаунта');
    } finally {
      setProfileBusy(false);
    }
  }

  const chatLayout = (
    <div className={`app-shell ${shouldShowCallPanel ? 'app-shell-call' : ''} ${isWatchingScreenShare ? 'app-shell-screen' : ''}`}>
      <aside className="nav-rail">
        <button
          className={`brand-badge ${primaryPaneMode === 'chat' ? 'brand-badge-active' : ''}`}
          type="button"
          title="Вернуться в чат"
          onClick={() => setPrimaryPaneMode('chat')}
        >
          S
        </button>
        <button
          className={`nav-rail__button ${primaryPaneMode === 'chat' ? 'nav-rail__button-active' : ''}`}
          type="button"
          title="Чат"
          onClick={() => setPrimaryPaneMode('chat')}
        >
          <i className="bi bi-chat-square-text-fill" />
        </button>
        <button
          className="nav-rail__button"
          title="Создать групповой чат"
          disabled={createGroupBusy}
          onClick={() => void handleCreateGroup()}
        >
          <i className="bi bi-plus-lg" />
        </button>
        <button
          className="nav-rail__button"
          title="Найти пользователей"
          onClick={() => setUserSearchOpen(true)}
        >
          <i className="bi bi-person-plus-fill" />
        </button>
        <div className="nav-rail__spacer" />
        {currentUser ? (
          <button
            className={`nav-rail__user ${profileSettingsOpen ? 'nav-rail__user-active' : ''}`}
            type="button"
            title="Настройки профиля"
            onClick={openProfileSettings}
          >
            <i className="bi bi-gear-fill" />
          </button>
        ) : null}
      </aside>

      {!isWatchingScreenShare ? (
        <ChatSidebar
          chats={filteredChats}
          displayByChatId={chatDisplayById}
          memberCounts={Object.fromEntries(Object.entries(membersByChat).map(([chatId, members]) => [Number(chatId), members.length]))}
          waitingCallCounts={waitingCallCountsByChat}
          selectedChatId={selectedChatId}
          chatSearch={chatSearch}
          activeCallChatId={activeCallChatId}
          onChatSearchChange={setChatSearch}
          onSelectChat={setSelectedChatId}
        />
      ) : null}

      {isWatchingScreenShare ? (
        <main ref={livekitScreenShellRef} className={`screen-share-shell ${screenShareFullscreen ? 'screen-share-shell-fullscreen' : ''}`}>
          <section className="screen-share-stage">
            <div className="screen-share-stage__header">
              <div>
                <p className="eyebrow mb-2">Демонстрация экрана</p>
                <h2 className="screen-share-stage__title mb-1">{watchingScreenShareName ?? 'Трансляция'}</h2>
                <p className="text-secondary mb-0 small">
                  Демка занимает область списка чатов и чата. Возврат и повторный вход доступны через левую панель.
                </p>
              </div>
              <div className="screen-share-stage__actions">
                <span className="status-pill status-pill-online">В эфире</span>
                <button className="btn btn-outline-light" type="button" onClick={() => void toggleScreenShareFullscreen()}>
                  <i className={`bi ${screenShareFullscreen ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'} me-2`} />
                  {screenShareFullscreen ? 'Свернуть' : 'Во весь экран'}
                </button>
                <button className="btn btn-outline-danger" type="button" onClick={leaveScreenShareView}>
                  <i className="bi bi-box-arrow-left me-2" />
                  Выйти из демки
                </button>
              </div>
            </div>
            <div
              className={`screen-share-stage__frame ${screenShareFullscreen ? 'screen-share-stage__frame-fullscreen' : ''}`}
              onClick={screenShareFullscreen ? () => void toggleScreenShareFullscreen() : undefined}
            >
              {screenShareFullscreen ? (
                <button
                  className="btn btn-dark screen-share-stage__floating-action"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void toggleScreenShareFullscreen();
                  }}
                >
                  <i className="bi bi-fullscreen-exit me-2" />
                  Свернуть
                </button>
              ) : null}
              <div ref={livekitScreenStageRef} className="screen-share-stage__mount" />
            </div>
          </section>
        </main>
      ) : (
        <main className="chat-stage">
          {selectedChat ? (
            <>
              <header className="chat-stage__header">
                {canEditSelectedGroup ? (
                  <button className="chat-edit-trigger" type="button" onClick={openGroupEdit}>
                    <Avatar name={selectedChat.name} url={selectedChat.avatar_url} accent="warm" />
                    <div className="chat-edit-trigger__content">
                      <h1 className="chat-stage__title">{selectedChat.name}</h1>
                      <p className="chat-stage__subtitle mb-0">
                        {summarizeChat(selectedChat, selectedMembers)}
                      </p>
                    </div>
                    <span className="chat-edit-trigger__icon">
                      <i className="bi bi-pencil-fill" />
                    </span>
                  </button>
                ) : (
                  <div className="d-flex gap-3 align-items-center">
                    <Avatar name={selectedChatDisplay?.name ?? selectedChat.name} url={selectedChatDisplay?.avatarUrl ?? selectedChat.avatar_url} accent="brand" />
                    <div>
                      <h1 className="chat-stage__title">{selectedChatDisplay?.name ?? selectedChat.name}</h1>
                      <p className="chat-stage__subtitle mb-0">
                        {activeCallChatId === selectedChat.id
                          ? summarizeChat(selectedChat, selectedMembers)
                          : selectedWaitingCallCount > 0
                            ? selectedWaitingCallCount === 1
                              ? '1 участник ждёт в комнате звонка'
                              : `${selectedWaitingCallCount} участников ждут в комнате звонка`
                            : summarizeChat(selectedChat, selectedMembers)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="chat-stage__actions">
                  {selectedChat.type === 'group' ? (
                    <button className="btn btn-outline-light" onClick={() => setGroupInviteOpen(true)}>
                      <i className="bi bi-person-plus-fill me-2" />
                      Пригласить
                    </button>
                  ) : null}
                  <button
                    className="btn btn-outline-light"
                    onClick={() => void handleLeaveChat()}
                    disabled={leaveChatBusy}
                  >
                    <i className="bi bi-box-arrow-right me-2" />
                    {leaveChatBusy ? 'Выходим...' : 'Покинуть чат'}
                  </button>
                  {activeCallChatId === selectedChat.id ? (
                    <button className="btn btn-outline-danger" onClick={() => void leaveCall()} disabled={callBusy || muteBusy}>
                      <i className="bi bi-telephone-x-fill me-2" />
                      Выйти из звонка
                    </button>
                  ) : (
                    <button className="btn btn-brand" onClick={() => void startCall(selectedChat.id)} disabled={callBusy || !wsOnline}>
                      <i className="bi bi-telephone-fill me-2" />
                      Позвонить
                    </button>
                  )}
                </div>
              </header>

              <>
                <section className="chat-stage__body" ref={chatBodyRef} onScroll={handleChatBodyScroll}>
                  <MessageList
                    chat={selectedChat}
                    currentUserId={currentUser?.id ?? 0}
                    messages={selectedMessages}
                    members={selectedMembers}
                    loading={loadingChatId === selectedChat.id}
                    editingMessageId={editingMessageId}
                    editingText={editingMessageText}
                    messageActionBusy={messageActionBusy}
                    onStartEdit={handleStartEditMessage}
                    onEditTextChange={setEditingMessageText}
                    onCancelEdit={handleCancelEditMessage}
                    onSaveEdit={handleSaveEditMessage}
                    onDeleteMessage={handleDeleteMessage}
                  />
                </section>

                <footer className="chat-stage__footer">
                  <MessageComposer
                    disabled={loadingChatId === selectedChat.id}
                    text={composerText}
                    files={composerFiles}
                    onTextChange={setComposerText}
                    onFilesChange={setComposerFiles}
                    onSubmit={handleSendMessage}
                  />
                </footer>
              </>
            </>
          ) : (
            <div className="pane-empty">
              <i className="bi bi-stars display-4 text-warning" />
              <h3>Создайте чат или откройте существующий</h3>
              <p>Используйте левую панель, чтобы начать личную или групповую переписку.</p>
            </div>
          )}
        </main>
      )}

      {shouldShowCallPanel && selectedChat ? (
        <aside className="call-panel">
          <div className="call-panel__header">
            <p className="eyebrow mb-2">Комната звонка</p>
            <h2 className="call-panel__title">Участники в {selectedChatDisplay?.name ?? selectedChat.name}</h2>
            <p className="text-secondary mb-0 small">
              {activeCallChatId === selectedChat.id
                ? 'Вы подключены к этой комнате.'
                : 'Кто-то уже находится в комнате. Вы можете присоединиться в любой момент.'}
            </p>
          </div>

          {activeCallChatId === selectedChat.id ? (
            <div className="call-status card-shell mb-3">
              <div className="d-flex justify-content-between align-items-center gap-3">
                <span>Демонстрация экрана</span>
                <span className={`status-pill ${LIVEKIT_URL ? 'status-pill-online' : 'status-pill-offline'}`}>
                  {localScreenShareActive ? 'Идёт трансляция' : LIVEKIT_URL ? 'Готово' : 'Недоступно'}
                </span>
              </div>
              <button
                className={`btn mt-3 w-100 ${localScreenShareActive ? 'btn-outline-danger' : 'btn-brand'}`}
                type="button"
                onClick={() => void toggleScreenShare()}
                disabled={screenShareBusy || activeCallChatId !== selectedChat.id || !LIVEKIT_URL}
              >
                <i className={`bi ${localScreenShareActive ? 'bi-display-fill' : 'bi-cast'} me-2`} />
                {screenShareBusy
                  ? 'Открываем выбор окна...'
                  : localScreenShareActive
                    ? 'Остановить демку'
                    : 'Включить демку'}
              </button>
              <small className="text-secondary d-block mt-2">
                {LIVEKIT_URL
                  ? localScreenShareActive
                    ? 'После остановки кнопка "Смотреть" исчезнет у остальных участников.'
                    : 'Браузер откроет системное окно выбора экрана или приложения.'
                  : 'Укажите VITE_LIVEKIT_URL, чтобы включить аудиосоединение.'}
              </small>
            </div>
          ) : null}

          <div className="participant-list">
            {selectedCallMembers.map((member) => {
              const memberIdentity =
                member.id === currentUser?.id && localParticipantIdentity
                  ? localParticipantIdentity
                  : String(member.id);
              const memberHasScreenShare = Boolean(screenShares[memberIdentity]);
              const isWatchingMember = watchingScreenShareIdentity === memberIdentity;

              return (
                <div key={member.id} className="participant-row">
                  <div className="participant-row__identity">
                    <div className="d-flex align-items-center gap-3">
                      <Avatar name={member.username} url={member.avatar_url} size="sm" accent="warm" />
                      <div>
                        <strong className="d-block">{member.username}</strong>
                        <small className="text-secondary">
                          {member.id === currentUser?.id
                            ? activeCallChatId === selectedChat.id
                              ? memberHasScreenShare
                                ? 'Вы показываете экран'
                                : 'Вы'
                              : 'Ожидает'
                            : activeCallChatId === selectedChat.id
                              ? memberHasScreenShare
                                ? 'Показывает экран'
                                : 'В комнате'
                              : 'Ожидает в комнате'}
                        </small>
                      </div>
                    </div>
                    {activeCallChatId === selectedChat.id ? (
                      <div className="participant-row__controls">
                        {member.id === currentUser?.id ? (
                          <button
                            className={`btn btn-sm ${selfMuted ? 'btn-outline-warning' : 'btn-outline-light'} align-self-start`}
                            onClick={() => void toggleSelfMute()}
                            disabled={muteBusy}
                          >
                            <i className={`bi ${selfMuted ? 'bi-mic-mute-fill' : 'bi-mic-fill'} me-2`} />
                            {muteBusy ? 'Обновляем...' : selfMuted ? 'Включить микрофон' : 'Выключить микрофон'}
                          </button>
                        ) : (
                          <label className="participant-volume" htmlFor={`participant-volume-${member.id}`}>
                            <div className="participant-volume__meta">
                              <span>Громкость</span>
                              <strong>{callVolumes[member.id] ?? DEFAULT_REMOTE_VOLUME}%</strong>
                            </div>
                            <input
                              id={`participant-volume-${member.id}`}
                              className="participant-volume__slider"
                              type="range"
                              min={0}
                              max={200}
                              step={1}
                              value={callVolumes[member.id] ?? DEFAULT_REMOTE_VOLUME}
                              onChange={(event) => handleCallVolumeChange(member.id, Number(event.target.value))}
                            />
                          </label>
                        )}
                        {memberHasScreenShare ? (
                          <button
                            className={`btn btn-sm ${isWatchingMember ? 'btn-brand' : 'btn-outline-light'}`}
                            type="button"
                            onClick={() => {
                              setWatchingScreenShareIdentity(memberIdentity);
                              setPrimaryPaneMode('screen');
                            }}
                          >
                            <i className="bi bi-play-btn-fill me-2" />
                            {isWatchingMember ? 'Смотрю' : 'Смотреть'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <span className={`live-dot ${memberHasScreenShare ? 'live-dot-active' : ''}`} />
                </div>
              );
            })}
            {!selectedCallMembers.length ? <div className="pane-empty pane-empty-compact">Пока никто не вошёл</div> : null}
          </div>
        </aside>
      ) : null}

      <div ref={livekitAudioSinkRef} hidden aria-hidden="true" />

      <div className="notification-column" aria-live="polite" aria-atomic="true">
        <InviteStack invites={invites} onAccept={acceptInvite} onDecline={declineInvite} />
        <ErrorToastStack
          toasts={errorToasts}
          onDismiss={dismissErrorToast}
          onToggleExpanded={toggleErrorToastExpanded}
        />
      </div>
      <UserSearchModal
        open={userSearchOpen}
        eyebrow="Друзья"
        title="Найти пользователя"
        placeholder="Введите username"
        helperText="Новый личный чат"
        emptyText="Ничего не найдено"
        idleText="Начни вводить имя пользователя"
        actionLabel="Добавить"
        actionBusyLabel="Добавление..."
        query={userSearchQuery}
        users={userSearchResults}
        busy={userSearchBusy}
        actionUserId={addUserBusyId}
        error={userSearchError}
        onQueryChange={setUserSearchQuery}
        onClose={() => setUserSearchOpen(false)}
        onAction={handleAddUser}
      />
      <UserSearchModal
        open={groupInviteOpen}
        eyebrow="Группа"
        title="Пригласить пользователя"
        placeholder="Поиск по username"
        helperText="Не состоит в этом чате"
        emptyText="Нет пользователей для приглашения"
        idleText="Найди пользователя для приглашения"
        actionLabel="Пригласить"
        actionBusyLabel="Приглашение..."
        query={groupInviteQuery}
        users={groupInviteResults}
        busy={groupInviteBusy}
        actionUserId={inviteUserBusyId}
        error={groupInviteError}
        onQueryChange={setGroupInviteQuery}
        onClose={() => setGroupInviteOpen(false)}
        onAction={handleInviteUser}
      />
      {selectedChat && selectedChat.type === 'group' ? (
        <GroupEditModal
          chat={selectedChat}
          open={groupEditOpen}
          name={groupEditName}
          previewUrl={groupEditPreview}
          busy={groupEditBusy}
          error={groupEditError}
          onNameChange={setGroupEditName}
          onFileChange={setGroupEditFile}
          onClose={closeGroupEdit}
          onSubmit={submitGroupEdit}
        />
      ) : null}
      {resolvedCurrentUser ? (
        <UserSettingsModal
          user={resolvedCurrentUser}
          open={profileSettingsOpen}
          username={profileName}
          previewUrl={profilePreview}
          busy={profileBusy}
          error={profileError}
          onUsernameChange={setProfileName}
          onFileChange={setProfileFile}
          onClose={closeProfileSettings}
          onSubmit={submitProfileSettings}
          onLogout={handleLogout}
        />
      ) : null}
      {showWsLoadingScreen ? (
        <div className="ws-loading-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="ws-loading-card">
            <p className="eyebrow mb-2">Realtime</p>
            <div className="spinner-border text-warning ws-loading-card__spinner" />
            <h2 className="ws-loading-card__title">Подключаемся к websocket</h2>
            <p className="ws-loading-card__text mb-0">
              {wsRef.current ? 'Соединение потеряно, переподключаем чат.' : 'Готовим живое соединение для чатов и звонков.'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute checking={checkingAuth} currentUser={currentUser}>
            <LoginScreen busy={loginBusy} error={loginError} onSubmit={handleLogin} />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute checking={checkingAuth} currentUser={currentUser}>
            {chatLayout}
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={currentUser ? '/' : '/login'} replace />} />
    </Routes>
  );
}
