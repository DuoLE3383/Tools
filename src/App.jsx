// App.jsx — centralized state + per-page routing

import { AuthProvider, useAuth } from './components/AuthProvider';
import { WebSocketProvider } from './components/WebSocketContext.jsx';
import { NiceHashOrderProvider } from './components/nicehash/NiceHashContext.jsx';
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import Modal from "./components/Modal";
import { createApiClient } from "./core/apiClient";
import Login from './components/Login.jsx';
import DashboardPage from './page/DashboardPage.jsx';
import "./App.css";

// ── Reducer ──────────────────────────────────
const initialView = (() => {
  return 'dashboard';
})();

const initialState = {
  loading: false,
  error: "",
  output: null,
  lastCall: null,
  responseModalOpen: false,
  responseModalContent: null,
  debugModalOpen: false, // Keep for debugging if needed
  usersModalOpen: false,
  algorithm: "",
  market: "",
  mrrClient: "BT",
  nhOrderClient: "BT",
  nhPoolClient: "BT",
  view: initialView,
  currentUser: null,
  coinPrices: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, view: action.payload };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_OUTPUT":
      return { ...state, output: action.payload };
    case "SET_LAST_CALL":
      return { ...state, lastCall: action.payload };
    case "SET_RESPONSE_MODAL":
      return { ...state, responseModalOpen: action.payload, responseModalContent: action.payload ? state.responseModalContent : null };
    case "SET_DEBUG_MODAL":
      return { ...state, debugModalOpen: action.payload };
    case "SET_USERS_MODAL":
      return { ...state, usersModalOpen: action.payload };
    case "SET_ALGORITHM":
      return { ...state, algorithm: action.payload };
    case "SET_MARKET":
      return { ...state, market: action.payload };
    case "SET_MRR_CLIENT":
      return { ...state, mrrClient: action.payload };
    case "SET_NH_ORDER_CLIENT":
      return { ...state, nhOrderClient: action.payload };
    case "SET_NH_POOL_CLIENT":
      return { ...state, nhPoolClient: action.payload };
    case "SET_CURRENT_USER":
      return { ...state, currentUser: action.payload };
    case "SET_COIN_PRICES":
      return { ...state, coinPrices: { ...(state.coinPrices || {}), ...action.payload } };
    default:
      return state;
  }
}

// ── AppContent ───────────────────────────────
function AppContent() {
  const { authToken, callApi, logout } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);

  // Lift current user from token if available
  useEffect(() => {
    if (!authToken) return;
    try {
      const parts = authToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        dispatch({ type: "SET_CURRENT_USER", payload: payload.user || { username: payload.username || "User", role: payload.role || "admin" } });
      }
    } catch {
      dispatch({ type: "SET_CURRENT_USER", payload: { username: "Unknown", role: "user" } });
    }
  }, [authToken]);

  const currentUser = state.currentUser || { username: "Unknown", role: "user" };
  const isAdmin = String(currentUser?.role || "").toLowerCase() === "admin";

  // ── API wrappers ──
  const handleMiningCall = useCallback((path, opts = {}) => {
    return callApi(path, { ...opts, section: "mining" });
  }, [callApi]);

  const handleHashpowerCall = useCallback((path, opts = {}) => {
    return callApi(path, { ...opts, section: "hashpower" });
  }, [callApi]);

  // ── Session verification ──
  useEffect(() => {
    if (!authToken) return undefined;

    const verifySession = () => {
      callApi("/api/v2/time", { silent: true })
        .catch((err) => {
          console.error('[Session] Verification failed:', err.message);
        });
    };

    verifySession();
    const interval = setInterval(verifySession, 30000);
    return () => clearInterval(interval);
  }, [authToken, callApi]);

  // ── Navigation ──
  const navigate = useCallback((to) => {
    const nextPath = String(to || "/").startsWith("/") ? String(to || "/") : `/${String(to || "")}`;
    window.history.pushState({}, "", "/");
    dispatch({ type: "SET_VIEW", payload: 'dashboard' });
  }, []);

  // ── Route handling ──
  useEffect(() => {
    const onPopState = () => {
      // Always force dashboard view
      dispatch({ type: "SET_VIEW", payload: 'dashboard' });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ── Force check ──
  const forceCheckStatus = useCallback(() => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: "" });
    callApi("/api/v2/mrr/monitor/run", { method: "POST", body: { client: "ALL" }, silent: true })
      .then(() => callApi("/api/v2/pools/check", { silent: true }))
      .catch((err) => dispatch({ type: "SET_ERROR", payload: err.message }))
      .finally(() => dispatch({ type: "SET_LOADING", payload: false }));
  }, [callApi]);

  // ── Logout handler ──
  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  // ── Handle Open MRR Pools ──
  const handleOpenMrrPools = useCallback(() => {
    dispatch({ type: "SET_VIEW", payload: "dashboard" });
  }, []);

  // ── Render page ──
  const PageComponent = useMemo(() => {
    switch (state.view) {
      case 'dashboard':
      default:
        return () => (
          <DashboardPage
            state={state}
            dispatch={dispatch}
            callApi={callApi}
            handleLogout={handleLogout}
            currentUser={currentUser}
            isAdmin={isAdmin}
            forceCheckStatus={forceCheckStatus}
            setNhPoolClient={(v) => dispatch({ type: "SET_NH_POOL_CLIENT", payload: v })}
            setMrrClient={(v) => dispatch({ type: "SET_MRR_CLIENT", payload: v })}
          />
        );
    }
  }, [state, callApi, handleLogout, currentUser, isAdmin, forceCheckStatus]);

  // ✅ Wrap the ENTIRE app with providers
  // ✅ WebSocketProvider needs a valid token to connect
  return (
    <WebSocketProvider token={authToken}>
      <NiceHashOrderProvider nhClient={state.nhOrderClient} callApi={callApi}>
        <div className="app-shell">
          <PageComponent />

          {/* ─── GLOBAL MODALS ─── */}
          <Modal
            isOpen={state.responseModalOpen}
            onClose={() => dispatch({ type: "SET_RESPONSE_MODAL", payload: false })}
            title="API Response Details"
            maxWidth="1280px"
            minWidth="800px"
          >
            {state.lastCall && (
              <div className="response-meta" style={{ marginBottom: "15px", opacity: 0.8, fontSize: "12px" }}>
                <span>{state.lastCall.method} {state.lastCall.path} — {state.lastCall.status} ({state.lastCall.durationMs}ms)</span>
              </div>
            )}
            <pre className="response-body modal" style={{ maxHeight: "40vh", overflow: "auto" }}>
              {JSON.stringify(state.responseModalContent || state.output, null, 2)}
            </pre>
          </Modal>
        </div>
      </NiceHashOrderProvider>
    </WebSocketProvider>
  );
}

function AppContainer() {
  const { isAuthenticated, login, callApi } = useAuth();

  if (!isAuthenticated) {
    return <Login onLoginSuccess={login} onCall={callApi} />;
  }

  return <AppContent />;
}

// ─── Root App Component ────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppContainer />
    </AuthProvider>
  );
}