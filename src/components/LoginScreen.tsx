import { useState } from 'react';
import type { LoginPayload } from '../types';

interface LoginScreenProps {
  busy: boolean;
  error: string | null;
  onSubmit: (payload: LoginPayload) => Promise<void>;
}

export function LoginScreen({ busy, error, onSubmit }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const trimmedUsername = username.trim();
  const usernameValid = trimmedUsername.length >= 1 && trimmedUsername.length <= 20;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!usernameValid) {
      return;
    }

    await onSubmit({ username: trimmedUsername, password });
  }

  return (
    <div className="login-screen">
      <div className="login-screen__orb login-screen__orb-left" />
      <div className="login-screen__orb login-screen__orb-right" />
      <form className="login-card" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Для любителей черного</p>
          <h1 className="login-title">Suscord</h1>
          <p className="login-subtitle">
            Войдите в существующий аккаунт. Регистрация намеренно отключена.
          </p>
          {error ? <div className="login-error">{error}</div> : null}
        </div>

        <label className="form-label text-uppercase small fw-semibold text-secondary">Логин</label>
        <input
          className="form-control form-control-lg mb-3"
          autoComplete="username"
          minLength={1}
          maxLength={20}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />

        {!usernameValid && username.length > 0 ? (
          <div className="text-danger small mb-3">Логин должен содержать от 1 до 20 символов.</div>
        ) : null}

        <label className="form-label text-uppercase small fw-semibold text-secondary">Пароль</label>
        <input
          className="form-control form-control-lg"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button className="btn btn-brand btn-lg w-100 mt-4" disabled={busy || !usernameValid} type="submit">
          {busy ? 'Входим...' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
