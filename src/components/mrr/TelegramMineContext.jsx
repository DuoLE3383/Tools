// src/mrr/TelegramMineContext.jsx
import { createContext, useContext, useCallback } from 'react';

const TelegramMineContext = createContext();

export function TelegramMineProvider({ children, onCall }) {
  const notify = useCallback(async (message) => {
    if (!onCall) {
      console.warn('[TelegramMine] onCall not provided');
      return { ok: false, error: 'onCall not configured' };
    }
    try {
      const result = await onCall('/api/v2/telegram/send-mine', {
        method: 'POST',
        body: { message },
        silent: true,
      });
      if (!result?.success) {
        // The error object from the API might be `err` itself
        throw result;
      }
      return { ok: true };
    } catch (err) {
      const errorMessage = err?.error || err?.message || 'An unknown error occurred while sending message.';
      console.error('[TelegramMine] Failed to send message:', errorMessage, err);
      return { ok: false, error: errorMessage };
    }
  }, [onCall]);

  return (
    <TelegramMineContext.Provider value={{ notify }}>
      {children}
    </TelegramMineContext.Provider>
  );
}

export function useTelegramMine() {
  return useContext(TelegramMineContext);
}