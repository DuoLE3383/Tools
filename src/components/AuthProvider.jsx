import React, { createContext, useState, useCallback, useMemo, useContext } from 'react';
import { createApiClient } from '../core/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('token'));

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    setAuthToken(null);
  }, []);

  const callApi = useMemo(
    () =>
      createApiClient({
        onAuthError: () => {
          console.log("[Auth] Auth error detected, logging out.");
          handleLogout();
        },
      }),
    [handleLogout]
  );

  const handleLoginSuccess = useCallback((token) => {
    localStorage.setItem('token', token);
    setAuthToken(token);
  }, []);

  const value = useMemo(
    () => ({
      authToken,
      callApi,
      login: handleLoginSuccess,
      logout: handleLogout,
      isAuthenticated: !!authToken,
    }),
    [authToken, callApi, handleLoginSuccess, handleLogout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}