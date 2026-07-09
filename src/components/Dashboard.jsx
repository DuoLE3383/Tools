import { useEffect, useState, useCallback } from "react";
import Modal from "./Modal";
import TelegramManager from "./TelegramManager.jsx";
import { NiceHashOrderProvider, useNiceHashOrders } from "./nicehash/NiceHashContext.jsx";
import { RentedRigProvider } from "./mrr/RentedRigContext.jsx";
import MiningRigRental from "./mrr/MiningRigRental.jsx";
import MrrPoolsManager from "./mrr/MrrPoolsManager.jsx";
import CryptoRatePage from "./CryptoRatePage.jsx";
import HashrateCalculator from "./HashrateCalculator";

function RefreshOrdersButton() {
  const { loading, refresh } = useNiceHashOrders();
  return (
    <button className="btn-pro dashboard-btn" onClick={refresh} disabled={loading}>
      {loading ? "Refreshing..." : "Refresh Orders"}
    </button>
  );
}

export default function Dashboard({
  state,
  dispatch,
  callApi,
  handleLogout,
  currentUser,
  forceCheckStatus,
  handleMiningCall,
  handleOpenMrrPools: _externalOpenMrrPools,
  setNhOrderClient,
  setNhPoolClient,
  setMrrClient,
}) {
  const isAdmin = String(currentUser?.role || "").toLowerCase() === "admin";
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "user",
  });

  // MRR Pool state (inline on homepage)
  const [mrrPoolData, setMrrPoolData] = useState(null);
  const [mrrPoolRigId, setMrrPoolRigId] = useState("");
  const [mrrPoolRentalId, setMrrPoolRentalId] = useState("");

  const handleOpenMrrPools = useCallback(
    async (rig) => {
      if (!rig || !state.mrrClient) return;
      const targetClient = state.mrrClient === "VN" && rig.mrrClient ? rig.mrrClient : state.mrrClient;
      if (targetClient === "VN") return;

      const rigObj = typeof rig === "object" ? rig : { id: rig };
      const statusStr = String(
        typeof rigObj.status === "object" ? rigObj.status.status : rigObj.status || "",
      ).toLowerCase();
      const isRented = statusStr.includes("rented");
      const rigId = String(
        rigObj.rigid || rigObj.rig_id || rigObj.rig?.id || (isRented ? "" : rigObj.id),
      ).trim();
      const rentalId = String(
        rigObj.rentalid || rigObj.current_rental_id || rigObj.rental_id || (isRented ? rigObj.id : ""),
      ).trim();

      if (!rigId) return;

      const path = `/api/v2/mrr/rig/${encodeURIComponent(rigId)}/pool`;
      const result = await handleMiningCall(path, { query: { client: targetClient }, silent: true });

      if (result && result.success && result.data && rigObj.name) {
        const items = Array.isArray(result.data) ? result.data : [result.data];
        items.forEach((item) => { if (item && !item.name) item.name = rigObj.name; });
      }

      setMrrPoolData(result);
      setMrrPoolRigId(rigId);
      setMrrPoolRentalId(isRented ? rentalId : "");
    },
    [handleMiningCall, state.mrrClient],
  );

  // ── User management ──
  useEffect(() => {
    if (!usersModalOpen) return;
    let cancelled = false;
    const loadUsers = async () => {
      setUsersLoading(true);
      setUsersError("");
      try {
        const result = await callApi("/api/auth/users", { silent: true });
        if (cancelled) return;
        if (result?.success && Array.isArray(result.users)) {
          setUsers(result.users);
        } else {
          setUsersError(result?.error || result?.message || "Failed to load users.");
        }
      } catch (error) {
        if (!cancelled) setUsersError(error.message || String(error));
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    };
    loadUsers();
    return () => { cancelled = true; };
  }, [usersModalOpen, callApi]);

  useEffect(() => {
    if (!isAdmin && usersModalOpen) setUsersModalOpen(false);
  }, [isAdmin, usersModalOpen]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUsersLoading(true);
    setUsersError("");
    try {
      const payload = { username: newUser.username.trim(), password: newUser.password, role: newUser.role };
      const result = await callApi("/api/auth/users", { method: "POST", body: payload, showModal: true });
      if (result?.success) {
        setNewUser({ username: "", password: "", role: "user" });
        const refresh = await callApi("/api/auth/users", { silent: true });
        if (refresh?.success && Array.isArray(refresh.users)) setUsers(refresh.users);
      } else {
        setUsersError(result?.error || result?.message || "Failed to create user.");
      }
    } catch (error) {
      setUsersError(error.message || String(error));
    } finally {
      setUsersLoading(false);
    }
  };

  const handleDisableUser = async (username) => {
    if (!window.confirm(`Disable user "${username}"?`)) return;
    setUsersLoading(true);
    setUsersError("");
    try {
      const result = await callApi(`/api/auth/users/${encodeURIComponent(username)}/disable`, { method: "PUT", showModal: true });
      if (result?.success) {
        setUsers((prev) => prev.map((u) => u.username === username ? { ...u, active: 0 } : u));
      } else {
        setUsersError(result?.error || result?.message || "Failed to disable user.");
      }
    } catch (error) {
      setUsersError(error.message || String(error));
    } finally {
      setUsersLoading(false);
    }
  };

  const navigateTo = (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
    dispatch({
      type: "SET_VIEW",
      payload:
        path === "/cryptorate" ? "cryptorate"
        : path === "/mining" ? "mining"
        : path === "/miner" ? "miner"
        : path === "/nicehash" ? "nicehash"
        : path === "/orders" ? "orders"
        : "dashboard",
    });
  };

  const handleNavClick = (path) => (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateTo(path);
  };

  return (
    <RentedRigProvider callApi={callApi}>
    <NiceHashOrderProvider nhClient={state.nhOrderClient} callApi={callApi}>
    <div className="app-shell dashboard-shell">
      {/* ─── HEADER ─── */}
      <header className="app-header dashboard-header">
        <div className="brand-block">
          <div className="status-card dashboard-status-card">
            <div className="status-item">
              <span className="dashboard-system-label">SYSTEM:</span>
              <span
                className={`status-value ${state.loading ? "status-ready" : state.error ? "status-error" : "status-success"}`}
              >
                {state.loading ? "Loading..." : state.error ? "Error" : "Ready"}
              </span>
            </div>
            <div className="dashboard-actions-row">
              <div className="dashboard-user-info">
                <span className="dashboard-user-label">Logged in as</span>
                <span className="dashboard-user-name">{currentUser?.username || "Unknown user"}</span>
                <span className="dashboard-user-role">{currentUser?.role || "unknown"}</span>
              </div>
              <button className="btn-pro secondary dashboard-btn" onClick={() => forceCheckStatus()}>
                Force Check
              </button>
              <button className="btn-pro secondary dashboard-btn" onClick={() => dispatch({ type: "SET_DEBUG_MODAL", payload: true })}>
                Debug Logs
              </button>
              <button className="btn-pro secondary dashboard-btn" onClick={handleLogout}>
                Logout
              </button>
              {isAdmin && (
                <button className="btn-pro secondary dashboard-btn" onClick={() => setUsersModalOpen(true)}>
                  Users
                </button>
              )}
              <button className="btn-pro secondary dashboard-btn" onClick={() => dispatch({ type: "SET_CALCULATOR_MODAL", payload: true })}>
                Calculator
              </button>
              <a href="/nicehash" className="btn-pro secondary dashboard-btn" onClick={handleNavClick("/nicehash")}>
                NiceHash
              </a>
              <a href="/orders" className="btn-pro secondary dashboard-btn" onClick={handleNavClick("/orders")}>
                Orders
              </a>
              <a href="/mining" className="btn-pro secondary dashboard-btn" onClick={handleNavClick("/mining")}>
                Opportunities
              </a>
              <a href="/miner" className="btn-pro secondary dashboard-btn" onClick={handleNavClick("/miner")}>
                Miner
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ─── MAIN LAYOUT: MRR Content + Crypto Sidebar ─── */}
      <main
        className="dashboard"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr minmax(340px, 420px)",
          gap: "24px",
          alignItems: "start",
        }}
      >
        {/* ── LEFT COLUMN: MRR ── */}
        <div className="column-stack" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* MRR Rig Management */}
          <article className="panel" style={{ padding: "0" }}>
            <MiningRigRental
              onCall={handleMiningCall}
              mrrClient={state.mrrClient}
              setMrrClient={setMrrClient}
              onOpenMrrPools={handleOpenMrrPools}
            />
          </article>

          {/* MRR Pool Manager */}
          <article className="panel" style={{ maxHeight: "600px", overflowY: "auto" }}>
            <MrrPoolsManager
              onCall={handleMiningCall}
              mrrClient={state.mrrClient}
              externalPoolData={mrrPoolData}
              externalRigId={mrrPoolRigId}
              externalRentalId={mrrPoolRentalId}
              onClose={() => {
                setMrrPoolData(null);
                setMrrPoolRigId("");
                setMrrPoolRentalId("");
              }}
            />
          </article>
        </div>

        {/* ── RIGHT COLUMN: Crypto Rates ── */}
        {/* Telegram + Quick Actions */}
          <article className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <TelegramManager onCall={callApi} mrrClient={state.mrrClient} />
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <RefreshOrdersButton />
                <button className="btn-pro secondary" onClick={() => navigateTo("/nicehash")}>
                  NiceHash Full
                </button>
                <button className="btn-pro secondary" onClick={() => navigateTo("/orders")}>
                  Active Orders
                </button>
              </div>
            </div>
          
        <div className="column-stack" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <article className="panel" style={{ padding: "0" }}>
            <CryptoRatePage onCall={callApi} />
          </article>
        </div>
        </article>
      </main>

      {/* ─── MODALS ─── */}
      {isAdmin && (
        <Modal isOpen={usersModalOpen} onClose={() => setUsersModalOpen(false)} title="User Management" maxWidth="900px">
          <div style={{ display: "grid", gap: "18px" }}>
            <form onSubmit={handleCreateUser} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px auto", gap: "10px", alignItems: "end" }}>
              <div>
                <label className="label-pro">Username</label>
                <input className="select-pro" value={newUser.username} onChange={(e) => setNewUser((prev) => ({ ...prev, username: e.target.value }))} autoComplete="off" required />
              </div>
              <div>
                <label className="label-pro">Password</label>
                <input type="password" className="select-pro" value={newUser.password} onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))} minLength={8} required />
              </div>
              <div>
                <label className="label-pro">Role</label>
                <select className="select-pro" value={newUser.role} onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value }))}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button className="btn-pro primary" type="submit" disabled={usersLoading}>
                {usersLoading ? "Saving..." : "Add User"}
              </button>
            </form>
            {usersError && <div style={{ color: "#f87171", fontSize: "13px" }}>{usersError}</div>}
            <div style={{ maxHeight: "50vh", overflow: "auto" }}>
              <table className="pro-table">
                <thead>
                  <tr>
                    <th>USERNAME</th>
                    <th>ROLE</th>
                    <th>STATUS</th>
                    <th>UPDATED</th>
                    <th style={{ textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {usersLoading && users.length === 0 ? (
                    <tr><td colSpan="5">Loading users...</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan="5">No users found.</td></tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.username}>
                        <td>{user.username}</td>
                        <td>{user.role}</td>
                        <td>{Number(user.active) === 1 ? "Active" : "Disabled"}</td>
                        <td>{user.updated_at ? new Date(Number(user.updated_at)).toLocaleString() : "-"}</td>
                        <td style={{ textAlign: "right" }}>
                          <button className="btn-pro secondary" onClick={() => handleDisableUser(user.username)} disabled={Number(user.active) !== 1 || usersLoading}>
                            Disable
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      <Modal isOpen={state.responseModalOpen} onClose={() => dispatch({ type: "SET_MODAL", payload: { content: null, open: false } })} title="API Operation Result" maxWidth="800px">
        {state.lastCall && (
          <div style={{ marginBottom: "15px", opacity: 0.7, fontSize: "11px", fontFamily: "monospace" }}>
            {state.lastCall.method} {state.lastCall.path} — {state.lastCall.status} ({state.lastCall.durationMs}ms)
          </div>
        )}
        <pre className="response-body" style={{ maxHeight: "50vh", overflow: "auto", background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "6px" }}>
          {JSON.stringify(state.modalContent, null, 2)}
        </pre>
      </Modal>

      <Modal isOpen={state.debugModalOpen} onClose={() => dispatch({ type: "SET_DEBUG_MODAL", payload: false })} title="System Debug Logs" maxWidth="800px">
        <div className="code-block-content" style={{ maxHeight: "60vh", overflow: "auto", fontSize: "11px", fontFamily: "monospace" }}>
          {state.debugLogs.length === 0 && <div style={{ opacity: 0.5 }}>No logs captured yet.</div>}
          {state.debugLogs.map((log, i) => (
            <div key={i} style={{ padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{log}</div>
          ))}
        </div>
        <div className="modal-actions" style={{ marginTop: "12px" }}>
          <button className="btn-pro secondary" onClick={() => dispatch({ type: "CLEAR_DEBUG_LOGS" })}>Clear Logs</button>
        </div>
      </Modal>

      <Modal isOpen={state.calculatorModalOpen} onClose={() => dispatch({ type: "SET_CALCULATOR_MODAL", payload: false })} title="Hashrate Calculator" maxWidth="600px">
        <HashrateCalculator />
      </Modal>
    </div>
    </NiceHashOrderProvider>
    </RentedRigProvider>
  );
}
