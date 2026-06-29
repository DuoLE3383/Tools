import React, { createContext, useContext, useCallback } from 'react';

const TelegramMineContext = createContext(null);

export function useTelegramMine() {
  const context = useContext(TelegramMineContext);
  if (!context) {
    throw new Error('useTelegramMine must be used within a TelegramMineProvider');
  }
  return context;
}

export function TelegramMineProvider({ children, onCall }) {
  const sendTelegramMessage = useCallback(async (message, options = {}) => {
    if (!message) return;

    try {
      const result = await onCall('/api/v2/telegram/send-mine', {
        method: 'POST',
        body: { message, ...options },
        silent: true,
      });

      if (!result.success) {
        console.error('[TelegramMine] Failed to send message:', result.error);
      }
      return result;
    } catch (err) {
      console.error('[TelegramMine] Error sending message:', err.message);
      return { success: false, error: err.message };
    }
  }, [onCall]);

  const notify = useCallback(async (message) => {
    return sendTelegramMessage(message);
  }, [sendTelegramMessage]);

  const value = {
    notify,
    sendTelegramMessage,
  };

  return (
    <TelegramMineContext.Provider value={value}>
      {children}
    </TelegramMineContext.Provider>
  );
}

export default TelegramMineContext;