import React, {
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";

const NotificationContext = createContext(null);

/**
 * A simple toast-style notification component.
 */
function Notification({ message, onDismiss }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "#ef4444",
        color: "white",
        padding: "12px 20px",
        borderRadius: "8px",
        boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: "15px",
      }}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: "none",
          color: "white",
          fontSize: "16px",
          cursor: "pointer",
          opacity: 0.7,
        }}
      >
        &times;
      </button>
    </div>
  );
}

export function NotificationProvider({ children }) {
  const [notification, setNotification] = useState(null);

  const addNotification = useCallback((message) => {
    setNotification({ id: crypto.randomUUID(), message });
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  }, []);

  const dismissNotification = useCallback(() => {
    setNotification(null);
  }, []);

  const value = { addNotification, dismissNotification };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {notification && (
        <Notification
          message={notification.message}
          onDismiss={dismissNotification}
        />
      )}
    </NotificationContext.Provider>
  );
}

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
};