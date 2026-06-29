// components/Admin/UserManagement.jsx
import React, { useState, useEffect } from 'react';
import Modal from '../Modal';

export function UserManagement({ isOpen, onClose, callApi }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "user",
  });

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const loadUsers = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await callApi("/api/auth/users", { silent: true });
        if (cancelled) return;
        if (result?.success && Array.isArray(result.users)) {
          setUsers(result.users);
        } else {
          setError(result?.error || result?.message || "Failed to load users.");
        }
      } catch (error) {
        if (!cancelled) setError(error.message || String(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadUsers();
    return () => {
      cancelled = true;
    };
  }, [isOpen, callApi]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
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
        setError(result?.error || result?.message || "Failed to create user.");
      }
    } catch (error) {
      setError(error.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleDisableUser = async (username) => {
    if (!window.confirm(`Disable user "${username}"?`)) return;
    setLoading(true);
    setError("");
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
        setError(result?.error || result?.message || "Failed to disable user.");
      }
    } catch (error) {
      setError(error.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
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
          <button className="btn-pro primary" type="submit" disabled={loading}>
            {loading ? "Saving..." : "Add User"}
          </button>
        </form>

        {error && (
          <div style={{ color: "#f87171", fontSize: "13px" }}>{error}</div>
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
              {loading && users.length === 0 ? (
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
                        disabled={Number(user.active) !== 1 || loading}
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
  );
}