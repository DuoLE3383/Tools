import { useCallback, useEffect, useState, useRef, useMemo, useReducer } from 'react';
import Login from './src/components/Login.jsx';
import { createApiClient } from './src/core/apiClient.js';
import Dashboard from './src/components/Dashboard.jsx';
import MiningPage from './src/components/mining/MiningPage.jsx';
import MinerPage from './src/components/MinerPage.jsx';
import MrrPage from './src/components/mrr/MrrPage.jsx';
import NiceHashPage from './src/components/nicehash/NiceHashPage.jsx';
import ActiveOrdersPage from './src/components/nicehash/ActiveOrdersPage.jsx';
import { RentedRigProvider } from './src/components/mrr/RentedRigContext.jsx';
import CryptoRatePage from './src/components/CryptoRatePage.jsx';
import './src/App.css';

const routeMap = {
  '/': 'dashboard',
  '/mining': 'mining',
  '/miner': 'miner',
  '/cryptorate': 'cryptorate',
  '/orders': 'orders',
  '/nicehash': 'nicehash',
  '/mrr': 'mrr',
};

const getViewForPath = (path) => routeMap[path] || 'dashboard';


// ============================================
// REDUCER FOR STATE MANAGEMENT
// ============================================
const initialState = {
  loading: false,
  error: '',
  poolData: null,
  rigsData: null,
  niceHashData: null,
  lastCall: null,
  modalContent: null,
  responseModalOpen: false,
  calculatorModalOpen: false,
  debugModalOpen: false,
  debugLogs: [],
  algorithm: '',
  market: '',
  nhOrderClient: 'BT',
  nhPoolClient: 'BT',
  mrrClient: 'BT',
  view: typeof window !== 'undefined' ? getViewForPath(window.location.pathname) : 'dashboard',
  activeDashboard: 'nicehash',
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_POOL_DATA':
      return { ...state, poolData: action.payload };
    case 'SET_RIGS_DATA':
      return { ...state, rigsData: action.payload };
    case 'SET_NICEHASH_DATA':
      return { ...state, niceHashData: action.payload };
    case 'SET_LAST_CALL':
      return { ...state, lastCall: action.payload };
    case 'SET_MODAL':
      return { ...state, modalContent: action.payload.content, responseModalOpen: action.payload.open };
    case 'SET_CALCULATOR_MODAL':
      return { ...state, calculatorModalOpen: action.payload };
    case 'SET_DEBUG_MODAL':
      return { ...state, debugModalOpen: action.payload };
    case 'ADD_DEBUG_LOG':
      return {
        ...state,
        debugLogs: [`[${new Date().toLocaleTimeString()}] ${action.payload}`, ...state.debugLogs].slice(0, 50)
      };
    case 'CLEAR_DEBUG_LOGS':
      return { ...state, debugLogs: [] };
    case 'SET_ALGORITHM':
      return { ...state, algorithm: action.payload };
    case 'SET_MARKET':
      return { ...state, market: action.payload };
    case 'SET_NH_ORDER_CLIENT':
      return { ...state, nhOrderClient: action.payload };
    case 'SET_NH_POOL_CLIENT':
      return { ...state, nhPoolClient: action.payload };
    case 'SET_MRR_CLIENT':
      return { ...state, mrrClient: action.payload };
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    case 'SET_ACTIVE_DASHBOARD':
      return { ...state, activeDashboard: action.payload };
    case 'RESET_STATE':
      return { ...initialState, view: state.view, nhOrderClient: state.nhOrderClient };
    case 'SET_NICEHASH_DATA_IF_NULL':
      return state.niceHashData === null ? { ...state, niceHashData: action.payload } : state;
    default:
      return state;
  }
}

// ============================================
// CACHE MANAGEMENT
// ============================================
class ApiCache {
  constructor() {
    this.cache = new Map();
    this.inflight = new Map();
    this.maxSize = 100;
    this.ttl = 30000; // 30 seconds default
  }

  get(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.ttl) {
      return entry.data;
    }
    this.cache.delete(key);
    return null;
  }

  set(key, data, ttl = this.ttl) {
    // Limit cache size
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  clear() {
    this.cache.clear();
  }

  getInflight(key) {
    return this.inflight.get(key);
  }

  setInflight(key, promise) {
    this.inflight.set(key, promise);
    return promise;
  }

  deleteInflight(key) {
    this.inflight.delete(key);
  }

  clearInflight() {
    this.inflight.clear();
  }
}

// ============================================
// MAIN APP COMPONENT
// ============================================
export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const apiCache = useRef(new ApiCache());
  const authTokenRef = useRef(() => localStorage.getItem('token'));
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('token'));
  const [sessionReady, setSessionReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const isMounted = useRef(true);
  const backgroundIntervalRef = useRef(null);

  // ============================================
  // MEMOIZED SELECTORS
  // ============================================
  const isAuthenticated = useMemo(() => !!authToken && sessionReady, [authToken, sessionReady]);

  // ============================================
  // DEBUG LOGGING
  // ============================================
  const addDebugLog = useCallback((msg, type = 'info') => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG:${type.toUpperCase()}] ${msg}`);
    }
    dispatch({ type: 'ADD_DEBUG_LOG', payload: msg });
  }, []);

  // ============================================
  // AUTH HANDLERS
  // ============================================
  const handleLoginSuccess = useCallback((token) => {
    localStorage.setItem('token', token);
    setAuthToken(token);
    setCurrentUser(null);
    setSessionReady(true);
    addDebugLog('Login successful, token stored.', 'success');
  }, [addDebugLog]);

  const handleLogout = useCallback(() => {
    window.history.pushState({}, '', '/');
    localStorage.removeItem('token');
    setAuthToken(null);
    setCurrentUser(null);
    setSessionReady(true);
    apiCache.current.clear();
    apiCache.current.clearInflight();
    // Reset state and also reset the view to dashboard
    dispatch({ type: 'RESET_STATE', payload: { view: 'dashboard' } });
    addDebugLog('Logged out, token cleared.', 'info');
  }, [addDebugLog]);

  const handleApiState = useCallback((action) => {
    switch (action.type) {
      case 'request-start':
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: '' });
        break;
      case 'request-finish':
        dispatch({ type: 'SET_LAST_CALL', payload: action.payload });
        break;
      case 'request-error':
        dispatch({ type: 'SET_ERROR', payload: action.payload.errorMsg });
        if (action.payload.showModal) {
          dispatch({ type: 'SET_MODAL', payload: { content: { error: action.payload.errorMsg }, open: true } });
        }
        break;
      case 'request-end':
        dispatch({ type: 'SET_LOADING', payload: false });
        break;
      default:
        break;
    }
  }, [dispatch]);

  const apiClient = useMemo(() => createApiClient({
    token: authToken,
    onAuthError: handleLogout,
    onState: handleApiState,
  }), [authToken, handleLogout, handleApiState]);

  // ============================================
  // STATE UPDATE HELPER
  // ============================================
  const updateSectionState = useCallback((section, data) => {
    if (!data) return;
    switch (section) {
      case 'pools':
        dispatch({ type: 'SET_POOL_DATA', payload: data });
        break;
      case 'rigs':
        dispatch({ type: 'SET_RIGS_DATA', payload: data });
        break;
      case 'mining':
        dispatch({ type: 'SET_NICEHASH_DATA', payload: data });
        break;
      default:
        // Fallback for initial load, handled by reducer to avoid dependency
        dispatch({ type: 'SET_NICEHASH_DATA_IF_NULL', payload: data });
        break;
    }
  }, [dispatch]);

  // ============================================
  // API CALL WRAPPER
  // ============================================
  const callApi = useCallback(async (path, options = {}) => {
    const { query, section, ...restOptions } = options;
    const enrichedQuery = { ...query };
    const isNhRequest = path.includes('/mining/') || path.includes('/pools') || path.includes('/hashpower');

    // Add application-specific client parameter to NiceHash calls
    if (path.startsWith('/api/v2/') && isNhRequest && !enrichedQuery.client) {
      const isPoolsEndpoint = path.includes('/pools') || section === 'pools';
      enrichedQuery.client = isPoolsEndpoint ? state.nhPoolClient : state.nhOrderClient;
    }

    const newOptions = { ...restOptions, query: enrichedQuery };
    const data = await apiClient(path, newOptions);

    // On success, update the relevant part of the application state
    if (data && data.success !== false) {
      const detectedSection = section || (
        path.includes('/pools') ? 'pools' :
        path.includes('/mining') || path.includes('/hashpower') ? 'mining' :
        path.includes('/rigs') ? 'rigs' : ''
      );
      updateSectionState(detectedSection, data);
    }

    return data;
  }, [apiClient, state.nhPoolClient, state.nhOrderClient, updateSectionState]);

  // ============================================
  // FORCE CHECK STATUS
  // ============================================
  const forceCheckStatus = useCallback(async () => {
    addDebugLog('Force checking system status...', 'warn');
    try {
      await callApi('/api/v2/mining/address', { silent: true, noCache: true });
      addDebugLog('System status check complete.', 'success');
    } catch (err) {
      addDebugLog(`Status check failed: ${err.message}`, 'error');
    }
  }, [callApi, addDebugLog]);

  // ============================================
  // HANDLERS
  // ============================================
  const handleMiningCall = useCallback((path, opts = {}) => {
    return callApi(path, { ...opts, section: 'mining' });
  }, [callApi]);

  const handleOpenMrrPools = useCallback(() => {
    // Placeholder for MRR pools modal
    addDebugLog('Opening MRR pools modal', 'info');
  }, [addDebugLog]);

  const setNhOrderClient = useCallback((client) => {
    dispatch({ type: 'SET_NH_ORDER_CLIENT', payload: client });
  }, []);

  const setNhPoolClient = useCallback((client) => {
    dispatch({ type: 'SET_NH_POOL_CLIENT', payload: client });
  }, []);

  const setMrrClient = useCallback((client) => {
    dispatch({ type: 'SET_MRR_CLIENT', payload: client });
  }, []);

  // ============================================
  // EFFECTS
  // ============================================

  // Route handling
  useEffect(() => {
    const handlePath = () => {
      const newView = getViewForPath(window.location.pathname);
      dispatch({ type: 'SET_VIEW', payload: newView });
    };
    window.addEventListener('popstate', handlePath);
    handlePath();
    return () => window.removeEventListener('popstate', handlePath);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const verifyPersistedSession = async () => {
      if (!authToken) {
        if (!cancelled) setSessionReady(true);
        if (!cancelled) setCurrentUser(null);
        return;
      }

      if (!cancelled) setSessionReady(false);

      // Set a timeout so we don't hang forever on slow networks
      const timeoutMs = 5000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch('/api/auth/profile', {
          method: 'GET',
          headers: { Authorization: `Bearer ${authToken}` },
          signal: controller.signal,
          credentials: 'omit',
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`Session check failed (${res.status})`);
        }

        // Token is valid — mark session ready immediately
        if (!cancelled) setSessionReady(true);
        if (!cancelled) setCurrentUser({ username: 'admin' });

        // Lightweight profile fetch — don't block sessionReady on it
        fetch('/api/auth/profile', {
          method: 'GET',
          headers: { Authorization: `Bearer ${authToken}` },
          credentials: 'omit',
        })
          .then((r) => r.json().catch(() => null))
          .then((profileData) => {
            if (!cancelled && profileData?.user) {
              setCurrentUser(profileData.user);
              // If the user's role is 'user', their homepage should be 'cryptorate'.
              if (profileData.user.role === 'user' && window.location.pathname === '/') {
                dispatch({ type: 'SET_VIEW', payload: 'cryptorate' });
                window.history.pushState({}, '', '/cryptorate');
              }
            }
          })
          .catch(() => {});
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          // Timeout — log out cleanly
          if (!cancelled) handleLogout();
        } else {
          if (!cancelled) handleLogout();
        }
      }
    };

    verifyPersistedSession();

    return () => {
      cancelled = true;
    };
  }, [authToken, handleLogout]);

  // Initial load - fetch data
  useEffect(() => {
    if (isAuthenticated) {
      addDebugLog('App initialized, fetching initial data', 'info');
      forceCheckStatus();

      // Fetch pools and rigs in parallel
      Promise.all([
        callApi('/api/v2/pools', { silent: true, section: 'pools' }),
        callApi('/api/v2/mining/rigs2', { silent: true, section: 'mining' }),
      ]).catch(err => addDebugLog(`Initial fetch error: ${err.message}`, 'error'));
    }
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Background refresh interval
  useEffect(() => {
    if (isAuthenticated) {
      backgroundIntervalRef.current = setInterval(() => {
        // Only refresh if not already loading
        if (!state.loading) {
          callApi('/api/v2/mining/address', { silent: true, background: true, section: 'mining' });
          callApi('/api/v2/pools', { silent: true, background: true, section: 'pools', noCache: true });
        }
      }, 60000); // 60 seconds
    }

    return () => {
      if (backgroundIntervalRef.current) {
        clearInterval(backgroundIntervalRef.current);
        backgroundIntervalRef.current = null;
      }
    };
  }, [isAuthenticated, callApi, state.loading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      apiCache.current.clear();
      apiCache.current.clearInflight();
    };
  }, []);

  // ============================================
  // RENDER
  // ============================================

  if (authToken && !sessionReady) {
    return (
      <div className="app-shell" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div className="panel" style={{ padding: '24px 32px', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          Verifying session...
        </div>
      </div>
    );
  }

  // Login screen
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} onCall={callApi} />;
  }

  // CryptoRate view — spans full viewport width with no max-width constraint
  if (state.view === 'cryptorate') {
    return (
      <div style={{ background: '#0f172a', minHeight: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px' }}>
          <button
            className="btn-pro secondary"
            onClick={() => {
              window.history.pushState({}, '', '/');
              dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
            }}
          >
            ← Back to Dashboard
          </button>
        </div>
        <CryptoRatePage onCall={callApi} />
      </div>
    );
  }

  if (state.view === 'mining') {
    return (
      <MiningPage
        onCall={callApi}
        currentUser={currentUser}
        nhClient={state.nhOrderClient}
        onNavigateHome={() => {
          window.history.pushState({}, '', '/');
          dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
        }}
      />
    );
  }

  if (state.view === 'miner') {
    return (
      <MinerPage
        onCall={callApi}
        currentUser={currentUser}
        onLogout={handleLogout}
        onNavigateHome={() => {
          window.history.pushState({}, '', '/');
          dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
        }}
      />
    );
  }

  if (state.view === 'nicehash') {
    return (
      <NiceHashPage
        onCall={callApi}
        currentUser={currentUser}
        nhClient={state.nhOrderClient}
        setNhClient={setNhOrderClient}
        onNavigateHome={() => {
          window.history.pushState({}, '', '/');
          dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
        }}
      />
    );
  }

  if (state.view === 'mrr') {
    return (
      <MrrPage
        onCall={callApi}
        currentUser={currentUser}
        onNavigateHome={() => {
          window.history.pushState({}, '', '/');
          dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
        }}
      />
    );
  }

  if (state.view === 'orders') {
    return (
      <ActiveOrdersPage
        onCall={callApi}
        currentUser={currentUser}
        nhClient={state.nhOrderClient}
        setNhClient={setNhOrderClient}
        onNavigateHome={() => {
          window.history.pushState({}, '', '/');
          dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
        }}
      />
    );
  }

  // ============================================
  // DASHBOARD
  // ============================================
  return (
    <RentedRigProvider callApi={callApi}>
      <Dashboard
        state={state}
        dispatch={dispatch}
        callApi={callApi}
        handleLogout={handleLogout}
        currentUser={currentUser}
        forceCheckStatus={forceCheckStatus}
        handleMiningCall={handleMiningCall}
        handleOpenMrrPools={handleOpenMrrPools}
        setNhOrderClient={setNhOrderClient}
        setNhPoolClient={setNhPoolClient}
        setMrrClient={setMrrClient}
      />
    </RentedRigProvider>
  );
}
