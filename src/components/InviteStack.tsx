import { useEffect, useState } from 'react';
import type { InviteToast } from '../types';
import { Avatar } from './Avatar';

interface InviteStackProps {
  invites: InviteToast[];
  onAccept: (invite: InviteToast) => Promise<void>;
  onDecline: (invite: InviteToast) => void;
}

export function InviteStack({ invites, onAccept, onDecline }: InviteStackProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="invite-stack">
      {invites.map((invite) => {
        const remainingMs = Math.max(invite.expiresAt - now, 0);
        const percent = (remainingMs / invite.ttlMs) * 100;
        const seconds = Math.ceil(remainingMs / 1000);

        return (
          <article key={invite.id} className="invite-toast" style={{ ['--invite-progress' as string]: `${percent}%` }}>
            <div className="invite-toast__top">
              <div className="d-flex gap-3 align-items-center">
                <Avatar name={invite.inviterName} url={invite.avatarUrl} size="sm" accent="warm" />
                <div>
                  <p className="mb-1 fw-semibold">
                    {invite.kind === 'call' ? 'Вход в комнату' : 'Приглашение в группу'}
                  </p>
                  <p className="mb-0 text-secondary small">
                    {invite.inviterName} • {invite.chatName}
                  </p>
                </div>
              </div>
              <span className="count-pill">{seconds}s</span>
            </div>

            <div className="invite-toast__actions">
              <button className="btn btn-brand flex-fill" onClick={() => void onAccept(invite)}>
                Принять
              </button>
              <button className="btn btn-outline-light flex-fill" onClick={() => onDecline(invite)}>
                Отклонить
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
