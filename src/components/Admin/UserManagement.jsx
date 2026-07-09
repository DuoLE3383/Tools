// components/Admin/UserManagement.jsx - UPDATED

import React, { useState, useEffect } from 'react';
import Modal from '../Modal';

// Define available roles - MUST MATCH BACKEND
const ROLES = {
  ADMIN: 'admin',
  MRR_VIEWER: 'mrr_viewer',
  MINER_VIEWER: 'miner_viewer',
  USER: 'user',
};

// Role display names and descriptions
const ROLE_INFO = {
  [ROLES.ADMIN]: { 
    label: 'Admin', 
    description: 'Full system access', 
    color: '#f87171',
    value: 'admin'
  },
  [ROLES.MRR_VIEWER]: { 
    label: 'MRR Viewer', 
    description: 'MRR management access', 
    color: '#fbbf24',
    value: 'mrr_viewer'
  },
  [ROLES.MINER_VIEWER]: { 
    label: 'Miner Viewer', 
    description: 'Mining operations access', 
    color: '#38bdf8',
    value: 'miner_viewer'
  },
  [ROLES.USER]: { 
    label: 'User', 
    description: 'Basic access', 
    color: '#94a3b8',
    value: 'user'
  },
};

// Valid roles array for validation
const VALID_ROLES = Object.values(ROLES);

export function UserManagement({ isOpen, onClose, callApi }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: ROLES.USER,
  });

  // Load users when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const loadUsers = async () => {
      setLoading(true);
      setError("");
      setSuccess("");
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

  // Create new user
  const handleCreateUser = async (e) => {
    e.preventDefault();
    
    // Validate
    const username = newUser.username.trim();
    if (!username) {
      setError("Username is required");
      return;
    }
    if (username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (!newUser.password || newUser.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    
    // ✅ VALIDATE ROLE - Make sure it's one of the allowed values
    if (!VALID_ROLES.includes(newUser.role)) {
      setError(`Invalid role: "${newUser.role}". Must be one of: ${VALID_ROLES.join(', ')}`);
      return;
    }
    
    setLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const payload = {
        username: username,
        password: newUser.password,
        role: newUser.role, // This MUST be one of: admin, mrr_viewer, miner_viewer, user
      };
      
      console.log('📝 Creating user with payload:', payload); // Debug log
      
      const result = await callApi("/api/auth/users", {
        method: "POST",
        body: payload,
        showModal: true,
      });
      
      if (result?.success) {
        setSuccess(`User "${username}" created successfully!`);
        // Reset form
        setNewUser({ 
          username: "", 
          password: "", 
          role: ROLES.USER 
        });
        // Refresh user list
        const refresh = await callApi("/api/auth/users", { silent: true });
        if (refresh?.success && Array.isArray(refresh.users)) {
          setUsers(refresh.users);
        }
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(result?.error || result?.message || "Failed to create user.");
      }
    } catch (error) {
      console.error('❌ Error creating user:', error);
      setError(error.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  // Enable/disable user
  const handleToggleUser = async (username, currentStatus) => {
    const action = currentStatus === 1 ? 'disable' : 'enable';
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} user "${username}"?`)) {
      return;
    }
    
    setLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const endpoint = `/api/auth/users/${encodeURIComponent(username)}/${action}`;
      const result = await callApi(endpoint, {
        method: "PUT",
        showModal: true,
      });
      
      if (result?.success) {
        setSuccess(`User "${username}" ${action}d successfully!`);
        // Update user in list
        setUsers((prev) =>
          prev.map((user) =>
            user.username === username 
              ? { ...user, active: action === 'enable' ? 1 : 0 } 
              : user
          )
        );
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(result?.error || result?.message || `Failed to ${action} user.`);
      }
    } catch (error) {
      setError(error.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  // Delete user
  const handleDeleteUser = async (username) => {
    if (!window.confirm(`Permanently delete user "${username}"? This action cannot be undone.`)) {
      return;
    }
    
    setLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const result = await callApi(`/api/auth/users/${encodeURIComponent(username)}`, {
        method: "DELETE",
        showModal: true,
      });
      
      if (result?.success) {
        setSuccess(`User "${username}" deleted successfully!`);
        // Remove user from list
        setUsers((prev) => prev.filter((user) => user.username !== username));
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(result?.error || result?.message || "Failed to delete user.");
      }
    } catch (error) {
      setError(error.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  // Change user role
  const handleChangeRole = async (username, newRole) => {
    // ✅ Validate new role
    if (!VALID_ROLES.includes(newRole)) {
      setError(`Invalid role: "${newRole}". Must be one of: ${VALID_ROLES.join(', ')}`);
      return;
    }
    
    if (!window.confirm(`Change role for "${username}" to "${ROLE_INFO[newRole]?.label || newRole}"?`)) {
      return;
    }
    
    setLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const result = await callApi(`/api/auth/users/${encodeURIComponent(username)}/role`, {
        method: "PUT",
        body: { role: newRole },
        showModal: true,
      });
      
      if (result?.success) {
        setSuccess(`Role updated for "${username}"!`);
        // Update user in list
        setUsers((prev) =>
          prev.map((user) =>
            user.username === username 
              ? { ...user, role: newRole } 
              : user
          )
        );
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(result?.error || result?.message || "Failed to update role.");
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
      maxWidth="1000px"
    >
      <div style={{ display: "grid", gap: "18px" }}>
        {/* Success Message */}
        {success && (
          <div style={{ 
            padding: "12px", 
            borderRadius: "8px", 
            background: "rgba(52,211,153,0.15)", 
            color: "#34d399",
            border: "1px solid rgba(52,211,153,0.3)"
          }}>
            {success}
          </div>
        )}

        {/* Create User Form */}
        <form
          onSubmit={handleCreateUser}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 200px auto",
            gap: "12px",
            alignItems: "end",
            padding: "16px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: "8px",
            border: "1px solid rgba(148,163,184,0.12)",
          }}
        >
          <div>
            <label className="label-pro" style={{ display: "block", marginBottom: "4px" }}>
              Username
            </label>
            <input
              className="select-pro"
              value={newUser.username}
              onChange={(e) =>
                setNewUser((prev) => ({ ...prev, username: e.target.value }))
              }
              placeholder="Enter username"
              autoComplete="off"
              required
              minLength={3}
              disabled={loading}
            />
          </div>
          
          <div>
            <label className="label-pro" style={{ display: "block", marginBottom: "4px" }}>
              Password
            </label>
            <input
              type="password"
              className="select-pro"
              value={newUser.password}
              onChange={(e) =>
                setNewUser((prev) => ({ ...prev, password: e.target.value }))
              }
              placeholder="Min 8 characters"
              minLength={8}
              required
              disabled={loading}
            />
          </div>
          
          <div>
            <label className="label-pro" style={{ display: "block", marginBottom: "4px" }}>
              Role
            </label>
            <select
              className="select-pro"
              value={newUser.role}
              onChange={(e) =>
                setNewUser((prev) => ({ ...prev, role: e.target.value }))
              }
              disabled={loading}
            >
              {Object.entries(ROLE_INFO).map(([value, info]) => (
                <option key={value} value={value}>
                  {info.label} - {info.description}
                </option>
              ))}
            </select>
          </div>
          
          <button 
            className="btn-pro primary" 
            type="submit" 
            disabled={loading}
            style={{ minHeight: "42px" }}
          >
            {loading ? "Creating..." : "Add User"}
          </button>
        </form>

        {/* Error Message */}
        {error && (
          <div style={{ 
            padding: "12px", 
            borderRadius: "8px", 
            background: "rgba(248,113,113,0.15)", 
            color: "#f87171",
            border: "1px solid rgba(248,113,113,0.3)"
          }}>
            {error}
          </div>
        )}

        {/* Users Table */}
        <div style={{ maxHeight: "50vh", overflow: "auto" }}>
          <table className="pro-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Updated</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", padding: "20px" }}>
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", padding: "20px", color: "#94a3b8" }}>
                    No users found. Create your first user above.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isActive = Number(user.active) === 1;
                  const roleInfo = ROLE_INFO[user.role] || { 
                    label: user.role || 'Unknown', 
                    color: '#94a3b8',
                    value: user.role 
                  };
                  
                  return (
                    <tr key={user.username}>
                      <td>
                        <strong>{user.username}</strong>
                      </td>
                      <td>
                        <span style={{ 
                          color: roleInfo.color,
                          fontWeight: 600,
                          fontSize: "12px",
                          textTransform: "uppercase"
                        }}>
                          {roleInfo.label}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background: isActive 
                            ? "rgba(52,211,153,0.15)" 
                            : "rgba(148,163,184,0.15)",
                          color: isActive ? "#34d399" : "#94a3b8",
                        }}>
                          {isActive ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td style={{ fontSize: "12px", color: "#94a3b8" }}>
                        {user.updated_at 
                          ? new Date(Number(user.updated_at)).toLocaleString() 
                          : "-"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {/* Role Change Dropdown */}
                        <select
                          className="select-pro"
                          value={user.role}
                          onChange={(e) => handleChangeRole(user.username, e.target.value)}
                          disabled={loading || user.username === 'admin'}
                          style={{ 
                            fontSize: "11px", 
                            padding: "4px 8px", 
                            marginRight: "8px",
                            minWidth: "100px",
                          }}
                        >
                          {Object.entries(ROLE_INFO).map(([value, info]) => (
                            <option key={value} value={value}>
                              {info.label}
                            </option>
                          ))}
                        </select>

                        {/* Enable/Disable Button */}
                        <button
                          className={isActive ? "btn-pro secondary" : "btn-pro primary"}
                          onClick={() => handleToggleUser(user.username, isActive ? 1 : 0)}
                          disabled={loading || user.username === 'admin'}
                          style={{ 
                            marginRight: "8px",
                            fontSize: "11px",
                            padding: "4px 12px",
                          }}
                        >
                          {isActive ? "Disable" : "Enable"}
                        </button>

                        {/* Delete Button */}
                        <button
                          className="btn-pro danger"
                          onClick={() => handleDeleteUser(user.username)}
                          disabled={loading || user.username === 'admin'}
                          style={{ 
                            fontSize: "11px", 
                            padding: "4px 12px",
                            background: "rgba(248,113,113,0.15)",
                            color: "#f87171",
                            border: "1px solid rgba(248,113,113,0.3)",
                            borderRadius: "6px",
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div style={{ 
          display: "flex", 
          gap: "16px", 
          padding: "8px 12px",
          background: "rgba(255,255,255,0.02)",
          borderRadius: "6px",
          fontSize: "11px",
          color: "#94a3b8",
          flexWrap: "wrap",
        }}>
          {Object.entries(ROLE_INFO).map(([role, info]) => (
            <span key={role} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ 
                display: "inline-block", 
                width: "10px", 
                height: "10px", 
                borderRadius: "50%", 
                background: info.color 
              }} />
              <strong>{info.label}</strong>
              <span style={{ color: "#64748b" }}>({info.description})</span>
            </span>
          ))}
        </div>
      </div>
    </Modal>
  );
}