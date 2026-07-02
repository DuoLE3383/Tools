import { useEffect, useState } from "react";
import Pools from "./Pools";
import Modal from "./Modal";
import NiceHash from "./nicehash/NiceHash";
import MiningRigSection from "./mrr/MiningRigSection";
import { NiceHashOrderProvider } from "./nicehash/NiceHashContext.jsx";
import HashrateCalculator from "./HashrateCalculator";

export default function Dashboard({
  state,
  dispatch,
  callApi,
  handleLogout,
  currentUser,
  forceCheckStatus,
  handleMiningCall,
  handleOpenMrrPools,
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
    return () => {
      cancelled = true;
    };
  }, [usersModalOpen, callApi]);

  useEffect(() => {
    if (!isAdmin && usersModalOpen) {
      setUsersModalOpen(false);
    }
  }, [isAdmin, usersModalOpen]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUsersLoading(true);
    setUsersError("");
    try {
      const payload = {
        username: newUser.username.trim(),
        password: newUser.password,
        role: newUser.role,
      };
      const result = await callApi("/api/auth/users", {
        method: "POST",
        body: payload,
        showModal: true,
      });
      if (result?.success) {
        setNewUser({ username: "", password: "", role: "user" });
        const refresh = await callApi("/api/auth/users", { silent: true });
        if (refresh?.success && Array.isArray(refresh.users)) {
          setUsers(refresh.users);
        }
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
      const result = await callApi(`/api/auth/users/${encodeURIComponent(username)}/disable`, {
        method: "PUT",
        showModal: true,
      });
      if (result?.success) {
        setUsers((prev) =>
          prev.map((user) =>
            user.username === username ? { ...user, active: 0 } : user,
          ),
        );
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
      payload: path === "/cryptorate" ? "cryptorate" : path === "/mining" ? "mining" : "dashboard",
    });
  };

  const handleNavClick = (path) => (event) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigateTo(path);
  };

  return (
    <div
      className="app-shell dashboard-shell"
      style={{ padding: "0 20px 40px", margin: "0 auto" }}
    >
      {/* HEADER */}
      <header
        className="app-header"
        style={{
          padding: "40px 0",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          marginBottom: "30px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <div className="brand-block" style={{ flex: 1 }}>
          <div className="status-card" style={{ marginBottom: "2px" }}>
            <div className="status-item">
              <span style={{ opacity: 0.5, marginRight: "10px" }}>SYSTEM:</span>
              <span
                className={`status-value ${state.loading ? "status-ready" : state.error ? "status-error" : "status-success"}`}
              >
                {state.loading ? "Loading..." : state.error ? "Error" : "Ready"}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: "8px",
                marginTop: "8px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  marginRight: "10px",
                  minWidth: "160px",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: "11px", opacity: 0.55 }}>Logged in as</span>
                <span style={{ fontSize: "13px", fontWeight: 700 }}>
                  {currentUser?.username || "Unknown user"}
                </span>
                <span style={{ fontSize: "11px", opacity: 0.7, textTransform: "uppercase" }}>
                  {currentUser?.role || "unknown"}
                </span>
              </div>
              <button
                className="btn-pro secondary"
                onClick={() => {
                  forceCheckStatus();
                }}
                style={{ fontSize: "10px" }}
              >
                Force Check
              </button>
              <button
                className="btn-pro secondary"
                onClick={() =>
                  dispatch({ type: "SET_DEBUG_MODAL", payload: true })
                }
                style={{ fontSize: "10px" }}
              >
                Debug Logs
              </button>
              <button
                className="btn-pro secondary"
                onClick={handleLogout}
                style={{ fontSize: "10px" }}
              >
                Logout
              </button>
              {isAdmin && (
                <button
                  className="btn-pro secondary"
                  onClick={() => setUsersModalOpen(true)}
                  style={{ fontSize: "10px" }}
                >
                  Users
                </button>
              )}



              {/* Calculator - Modal */}
              <button
                className="btn-pro secondary"
                onClick={() =>
                  dispatch({ type: "SET_CALCULATOR_MODAL", payload: true })
                }
                style={{ fontSize: "10px" }}
              >
                Calculator
              </button>

              {/* Live Rates */}
              <a
                href="/cryptorate"
                className="btn-pro secondary"
                onClick={handleNavClick("/cryptorate")}
                style={{
                  fontSize: "10px",
                  textAlign: "center",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Live Rates
              </a>

              {/* Mining */}
              <a
                href="/mining"
                className="btn-pro secondary"
                onClick={handleNavClick("/mining")}
                style={{
                  fontSize: "10px",
                  textAlign: "center",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Mining
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* POOLS SECTION
      <section
        className="pools-section"
        style={{
          marginBottom: "15px",
          marginTop: "0px",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          borderRadius: "16px",
          padding: "24px",
          height: "850px",
          minHeight: "200px",
          overflow: "auto",
        }}
      >
        <Pools
          onCall={callApi}
          poolData={state.poolData}
          niceHashData={state.niceHashData}
          mrrClient={state.mrrClient}
          setMrrClient={setMrrClient}
          nhClient={state.nhPoolClient}
          setNhClient={setNhPoolClient}
        />
      </section> */}

      {/* MAIN DASHBOARD */}
      <main className="dashboard">
        <div
          className="column-stack"
          style={{ display: "flex", flexDirection: "column", gap: "24px" }}
        >
          <NiceHashOrderProvider
            nhClient={state.nhOrderClient}
            callApi={callApi}
          >
            {/* NICEHASH SECTION */}
            <article className="panel">
              <NiceHash
                key={state.nhOrderClient}
                onCall={handleMiningCall}
                output={state.niceHashData}
                algorithm={state.algorithm}
                market={state.market}
                nhClient={state.nhOrderClient}
                setNhClient={setNhOrderClient}
              />
            </article>

            {/* QUICK ACTIONS */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>Quick Actions</h3>
                <p
                  style={{
                    margin: "4px 0 0",
                    color: "var(--muted)",
                    fontSize: "0.85rem",
                  }}
                >
                  Open the hashrate calculator or view live rates.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  className="btn-pro secondary"
                  onClick={() =>
                    dispatch({ type: "SET_CALCULATOR_MODAL", payload: true })
                  }
                >
                  Open Calculator
                </button>
                <a
                  href="/cryptorate"
                  className="btn-pro secondary"
                  onClick={handleNavClick("/cryptorate")}
                  style={{
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  Live Rates
                </a>
              </div>
            </div>

            {/* MINING RIG SECTION */}
            <article className="panel">
              <MiningRigSection
                onCall={handleMiningCall}
                rigsData={state.rigsData}
                mrrClient={state.mrrClient}
                setMrrClient={setMrrClient}
                onOpenMrrPools={handleOpenMrrPools}
              />
            </article>
          </NiceHashOrderProvider>

          {/* HERO MINERS CARD */}
        </div>
      </main>

      {/* MODALS */}
      {isAdmin && (
        <Modal
          isOpen={usersModalOpen}
          onClose={() => setUsersModalOpen(false)}
          title="User Management"
          maxWidth="900px"
        >
          <div style={{ display: "grid", gap: "18px" }}>
            <form
              onSubmit={handleCreateUser}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 160px auto",
                gap: "10px",
                alignItems: "end",
              }}
            >
              <div>
                <label className="label-pro">Username</label>
                <input
                  className="select-pro"
                  value={newUser.username}
                  onChange={(e) =>
                    setNewUser((prev) => ({ ...prev, username: e.target.value }))
                  }
                  autoComplete="off"
                  required
                />
              </div>
              <div>
                <label className="label-pro">Password</label>
                <input
                  type="password"
                  className="select-pro"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser((prev) => ({ ...prev, password: e.target.value }))
                  }
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className="label-pro">Role</label>
                <select
                  className="select-pro"
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser((prev) => ({ ...prev, role: e.target.value }))
                  }
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button className="btn-pro primary" type="submit" disabled={usersLoading}>
                {usersLoading ? "Saving..." : "Add User"}
              </button>
            </form>

            {usersError && (
              <div style={{ color: "#f87171", fontSize: "13px" }}>{usersError}</div>
            )}

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
                    <tr>
                      <td colSpan="5">Loading users...</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan="5">No users found.</td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.username}>
                        <td>{user.username}</td>
                        <td>{user.role}</td>
                        <td>{Number(user.active) === 1 ? "Active" : "Disabled"}</td>
                        <td>{user.updated_at ? new Date(Number(user.updated_at)).toLocaleString() : "-"}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="btn-pro secondary"
                            onClick={() => handleDisableUser(user.username)}
                            disabled={Number(user.active) !== 1 || usersLoading}
                          >
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

      <Modal
        isOpen={state.responseModalOpen}
        onClose={() =>
          dispatch({
            type: "SET_MODAL",
            payload: { content: null, open: false },
          })
        }
        title="API Operation Result"
        maxWidth="800px"
      >
        {state.lastCall && (
          <div
            style={{
              marginBottom: "15px",
              opacity: 0.7,
              fontSize: "11px",
              fontFamily: "monospace",
            }}
          >
            {state.lastCall.method} {state.lastCall.path} —{" "}
            {state.lastCall.status} ({state.lastCall.durationMs}ms)
          </div>
        )}
        <pre
          className="response-body"
          style={{
            maxHeight: "50vh",
            overflow: "auto",
            background: "rgba(0,0,0,0.3)",
            padding: "12px",
            borderRadius: "6px",
          }}
        >
          {JSON.stringify(state.modalContent, null, 2)}
        </pre>
      </Modal>

      <Modal
        isOpen={state.debugModalOpen}
        onClose={() => dispatch({ type: "SET_DEBUG_MODAL", payload: false })}
        title="System Debug Logs"
        maxWidth="800px"
      >
        <div
          className="code-block-content"
          style={{
            maxHeight: "60vh",
            overflow: "auto",
            fontSize: "11px",
            fontFamily: "monospace",
          }}
        >
          {state.debugLogs.length === 0 && (
            <div style={{ opacity: 0.5 }}>No logs captured yet.</div>
          )}
          {state.debugLogs.map((log, i) => (
            <div
              key={i}
              style={{
                padding: "2px 0",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              {log}
            </div>
          ))}
        </div>
        <div className="modal-actions" style={{ marginTop: "12px" }}>
          <button
            className="btn-pro secondary"
            onClick={() => dispatch({ type: "CLEAR_DEBUG_LOGS" })}
          >
            Clear Logs
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={state.calculatorModalOpen}
        onClose={() =>
          dispatch({ type: "SET_CALCULATOR_MODAL", payload: false })
        }
        title="Hashrate Calculator"
        maxWidth="600px"
      >
        <HashrateCalculator />
      </Modal>
    </div>
  );
}
