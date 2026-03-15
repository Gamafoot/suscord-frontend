import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { User } from '../types';

interface GuardProps {
  checking: boolean;
  currentUser: User | null;
  children: ReactNode;
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="spinner-border text-warning" />
    </div>
  );
}

export function ProtectedRoute({ checking, currentUser, children }: GuardProps) {
  if (checking) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function PublicOnlyRoute({ checking, currentUser, children }: GuardProps) {
  if (checking) {
    return <LoadingScreen />;
  }

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
