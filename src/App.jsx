// App.jsx — centralized state + per-page routing

import { WebSocketProvider } from './components/WebSocketContext';
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import Modal from "./components/Modal";
import HashCompletionCalculator from "./components/ProfitCompletion.jsx";
import CryptoRatePage from "../CryptoRatePage.jsx";
import MiningPage from "./components/mining/MiningPage.jsx";
import { createApiClient } from "./core/apiClient";
import Login from './components/Login.jsx';
import DashboardPage from './page/DashboardPage.jsx';
import NiceHashPage from './page/NiceHashPage.jsx';
import MrrPage from './page/MrrPage.jsx';
import "./App.css";

// ── Reducer ──────────────────────────────────
const initialView = (() => {
  const p = window.location.pathname;
  if (p === '/mining') return 'mining';
  if (p === '/nicehash') return 'nicehash';
  if (p === '/mrr') return 'mrr';
  if (p === '/cryptorate') return 'cryptorate';
  return 'dashboard';
})();

const initialState = {
  loading: false,
  error: "",
  output: null,
  lastCall: null,
  responseModalOpen: false,
  responseModalContent: null,
  debugModalOpen: false,
  completionModalOpen: false,
  completionCalculatorContext: null,
  calculatorModalOpen: false,
  usersModalOpen: false,
  algorithm: "",
  market: "",
  mrrClient: "BT",
  nhOrderClient: "BT",
  nhPoolClient: "BT",
  view: initialView,
  currentUser: null,
  coinPrices: null, // Add coin prices to global state
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
    case "SET_RESPONSE_MODAL_CONTENT":
      return { ...state, responseModalContent: action.payload };
    case "SET_DEBUG_MODAL":
      return { ...state, debugModalOpen: action.payload };
    case "SET_COMPLETION_MODAL":
      return { ...state, completionModalOpen: action.payload };
    case "SET_COMPLETION_CONTEXT":
      return { ...state, completionCalculatorContext: action.payload };
    case "SET_CALCULATOR_MODAL":
      return { ...state, calculatorModalOpen: action.payload };
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
function AppContent({ authToken, onLoginSuccess, onLogout, callApi, setAuthToken }) {
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

  // ── Helpers ──
  const toDateTimeLocal = (value) => {
    if (!value) return "";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return "";
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  };

  const parseHashrateValue = (value) => {
    if (value === undefined || value === null) return "";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") {
      const parsed = parseFloat(value.replace(/,/g, ""));
      return Number.isFinite(parsed) ? String(parsed) : "";
    }
    if (typeof value === "object") {
      return parseHashrateValue(
        value.hash || value.advertised || value.nice || value.value || Object.values(value)[0]
      );
    }
    return "";
  };

  const inferUnitValue = (source) => {
    const unitMap = { EH: 1e18, PH: 1e15, TH: 1e12, GH: 1e9, MH: 1e6, KH: 1e3, H: 1 };
    if (source === undefined || source === null) return 1e12;
    if (typeof source === "number" && Number.isFinite(source)) return source;
    const normalized = String(source).toUpperCase().replace(/\s+/g, "");
    const match = normalized.match(/(EH|PH|TH|GH|MH|KH|H)(?:\/S)?$/) || normalized.match(/(EH|PH|TH|GH|MH|KH|H)/);
    if (match && match[1]) return unitMap[match[1]] || 1e12;
    return 1e12;
  };

  const openCompletionCalculator = useCallback((rig, info = {}) => {
    const algo = info?.algo || rig?.algo || rig?.algorithm || rig?.type || "";
    const start = toDateTimeLocal(
      info?.startTime || rig?.start || (typeof rig?.status === "object" ? rig.status.start : "") || ""
    );
    const end = toDateTimeLocal(
      info?.endTime || rig?.end || (typeof rig?.status === "object" ? rig.status.end : "") || ""
    );
    const adsHashrate = parseHashrateValue(
      info?.advertised || rig?.hashrate?.advertised || rig?.advertised || rig?.hashrate?.hash || rig?.hash || ""
    );
    const avgHashrate = parseHashrateValue(
      info?.average || rig?.hashrate?.average || rig?.average || rig?.hash || ""
    );
    const unit = inferUnitValue(
      info?.advertised || info?.average || rig?.hashrate?.advertised || rig?.hashrate?.average || 
      rig?.hashrate?.suffix || rig?.hashrate_unit || rig?.hashrate?.type || ""
    );
    const nhPriceData = info?.nicehashPrice || rig?.nicehashPrice;
    const rawPrice = info?.price || rig?.price || rig?.min_price || null;
    const priceSource = rawPrice?.paid !== undefined
      ? { paid: rawPrice.paid, currency: rawPrice.currency || rawPrice.price_unit || "BTC" }
      : rawPrice;
    const btcPriceSource = info?.price_converted || rig?.price_converted || info?.price?.BTC || rig?.price?.BTC || priceSource;
    const priceUnit = rig?.hashrate_unit || rig?.hashrate?.advertised?.type || rig?.hashrate?.suffix || rig?.hashrate?.type || "TH";

    dispatch({ type: "SET_COMPLETION_CONTEXT", payload: {
      initialAlgo: algo,
      initialStartTime: start,
      initialEndTime: end,
      initialAdsHashrate: adsHashrate,
      initialAvgHashrate: avgHashrate,
      initialUnit: unit,
      initialPriceSource: priceSource,
      initialBtcPriceSource: btcPriceSource,
      initialPriceUnit: priceUnit,
      initialNhPriceData: nhPriceData,
    }});
    dispatch({ type: "SET_COMPLETION_MODAL", payload: true });
  }, []);

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
      console.log('[Session] Verifying session...');
      callApi("/api/v2/time", { silent: true })
        .then(response => {
          if (response && response.success) {
            console.log('[Session] Verification successful.');
          } else {
            // This case might occur if the API returns { success: false } but not a 401/403
            console.warn('[Session] Verification check returned an API error:', response?.error || 'Unknown error');
          }
        })
        .catch((err) => {
          // This catches network errors or errors thrown by apiClient (like 401/403)
          // The onAuthError handler in apiClient will handle logout, but we log it here for visibility.
          console.error('[Session] Verification failed:', err.message);
        });
    };

    verifySession();
    const interval = setInterval(verifySession, 30000);
  }, [authToken, callApi]);

  // ── Navigation ──
  const navigate = useCallback((to) => {
    const nextPath = String(to || "/").startsWith("/") ? String(to || "/") : `/${String(to || "")}`;
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    let view = 'dashboard';
    if (nextPath === '/mining') view = 'mining';
    else if (nextPath === '/nicehash') view = 'nicehash';
    else if (nextPath === '/mrr') view = 'mrr';
    else if (nextPath === '/cryptorate') view = 'cryptorate';
    dispatch({ type: "SET_VIEW", payload: view });
  }, []);

  // ── Route handling ──
  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      let view = 'dashboard';
      if (path === '/mining') view = 'mining';
      else if (path === '/nicehash') view = 'nicehash';
      else if (path === '/mrr') view = 'mrr';
      else if (path === '/cryptorate') view = 'cryptorate';
      dispatch({ type: "SET_VIEW", payload: view });
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
    localStorage.removeItem("token");
    setAuthToken(null);
    if (onLogout) onLogout();
  }, [onLogout, setAuthToken]);

  // ── Handle Open MRR Pools ──
  const handleOpenMrrPools = useCallback(() => {
    dispatch({ type: "SET_VIEW", payload: "dashboard" });
  }, []);

  // ── Render page ──
  const renderPage = () => {
    switch (state.view) {
      case 'mining':
        return (
          <MiningPage
            onCall={callApi}
            nhClient={state.nhPoolClient}
            onNavigateHome={() => navigate("/")}
          />
        );
      
      case 'nicehash':
        return (
          <NiceHashPage
            state={state}
            dispatch={dispatch}
            callApi={callApi}
            handleLogout={handleLogout}
            currentUser={currentUser}
            isAdmin={isAdmin}
            forceCheckStatus={forceCheckStatus}
            handleMiningCall={handleMiningCall}
            setNhOrderClient={(v) => dispatch({ type: "SET_NH_ORDER_CLIENT", payload: v })}
          />
        );
      
      case 'mrr':
        return (
          <MrrPage
            state={state}
            dispatch={dispatch}
            callApi={callApi}
            handleLogout={handleLogout}
            currentUser={currentUser}
            isAdmin={isAdmin}
            forceCheckStatus={forceCheckStatus}
            handleMiningCall={handleMiningCall}
            handleOpenMrrPools={handleOpenMrrPools}
            setMrrClient={(v) => dispatch({ type: "SET_MRR_CLIENT", payload: v })}
          />
        );
      
      case 'cryptorate':
        return <CryptoRatePage onCall={callApi} onNavigateHome={() => navigate("/")} coinPrices={state.coinPrices} />;
      
      case 'dashboard':
      default:
        return (
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
  };

  if (!authToken) {
    return <Login onLoginSuccess={onLoginSuccess} onCall={callApi} />;
  }

  return (
    <WebSocketProvider token={authToken}>
      <div className="app-shell">
        {renderPage()}

        {/* ─── GLOBAL MODALS ─── */}
        <Modal
          isOpen={state.responseModalOpen}
          onClose={() => dispatch({ type: "SET_RESPONSE_MODAL", payload: false })}
          title="API Response Details"
          maxWidth="1100px"
        >
          {state.lastCall && (
            <div className="response-meta" style={{ marginBottom: "15px", opacity: 0.8, fontSize: "12px" }}>
              <span>{state.lastCall.method} {state.lastCall.path} — {state.lastCall.status} ({state.lastCall.durationMs}ms)</span>
            </div>
          )}
          <pre className="response-body modal" style={{ maxHeight: "60vh", overflow: "auto" }}>
            {JSON.stringify(state.responseModalContent || state.output, null, 2)}
          </pre>
        </Modal>

        <Modal
          isOpen={state.completionModalOpen}
          onClose={() => dispatch({ type: "SET_COMPLETION_MODAL", payload: false })}
          title="Rental Completion Calculator"
          maxWidth="750px"
        >
          <HashCompletionCalculator {...state.completionCalculatorContext} />
        </Modal>
      </div>
    </WebSocketProvider>
  );
}

// ── App wrapper ──────────────────────────────
export default function App() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('token'));

  const callApi = useCallback(createApiClient({
      onAuthError: () => {
        console.log("[Auth] Auth error detected, logging out.");
        localStorage.removeItem('token');
        setAuthToken(null);
      },
    }),
    [setAuthToken]
  );

  const handleLoginSuccess = (token) => {
    localStorage.setItem('token', token);
    setAuthToken(token);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setAuthToken(null);
  };

  if (!authToken) {
    return <Login onLoginSuccess={handleLoginSuccess} onCall={callApi} />;
  }

  return <AppContent authToken={authToken} onLoginSuccess={handleLoginSuccess} onLogout={handleLogout} callApi={callApi} setAuthToken={setAuthToken} />;
}
