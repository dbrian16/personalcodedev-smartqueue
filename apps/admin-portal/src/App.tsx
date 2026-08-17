import React, { useState, useCallback } from 'react';
import Login from './Login';
import Dashboard from './Dashboard';
import StaffWorkspace from './StaffWorkspace';
import { ErrorBoundary } from '@omni/shared-ui';
import { UserMeta, UserRole } from './types';

interface SessionData {
  token: string;
  role: UserRole;
  meta: UserMeta;
}

const SESSION_KEYS = {
  TOKEN: 'mgtToken',
  ROLE: 'mgtRole',
  META: 'mgtMeta'
} as const;

const loadSession = (): SessionData | null => {
  const token = sessionStorage.getItem(SESSION_KEYS.TOKEN);
  const role = sessionStorage.getItem(SESSION_KEYS.ROLE) as UserRole | null;
  if (!token || !role) return null;

  let meta: UserMeta = {};
  try {
    meta = JSON.parse(sessionStorage.getItem(SESSION_KEYS.META) || '{}');
  } catch {
    // A corrupted meta blob must not lock the user out of a valid session.
  }

  return { token, role, meta };
};

function App() {
  const [session, setSession] = useState<SessionData | null>(loadSession);

  const handleLogin = useCallback((token: string, role: UserRole, meta: UserMeta) => {
    sessionStorage.setItem(SESSION_KEYS.TOKEN, token);
    sessionStorage.setItem(SESSION_KEYS.ROLE, role);
    sessionStorage.setItem(SESSION_KEYS.META, JSON.stringify(meta));
    setSession({ token, role, meta });
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEYS.TOKEN);
    sessionStorage.removeItem(SESSION_KEYS.ROLE);
    sessionStorage.removeItem(SESSION_KEYS.META);
    setSession(null);
  }, []);

  return (
    <ErrorBoundary>
      {!session ? (
        <Login onLogin={handleLogin} />
      ) : session.role === 'admin' ? (
        <Dashboard token={session.token} onLogout={handleLogout} />
      ) : (
        <StaffWorkspace
          token={session.token}
          userMeta={session.meta}
          onLogout={handleLogout}
        />
      )}
    </ErrorBoundary>
  );
}

export default App;
