// NiceHash.jsx - FINAL UPGRADED VERSION
// All API calls use the order's own client. "All Clients" works without errors.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import CryptoRatePage from "../../../CryptoRatePage.jsx";
import NiceHashOrderCard from "./NiceHashOrdersCard.jsx";
import { getAlgoMapping, getNiceHashUnit, convertUnit } from "../../core/mapping.js";
import { useNiceHashOrders } from "./NiceHashContext";

function NiceHashOrderManager({ onCall, nhClient, setNhClient }) {
  const {
    nicehashOrders,
    refresh: refreshSummary,
    summary,
    loading: contextLoading,
    showPriceLookupModal,
    setShowPriceLookupModal,
    getOrderPrice,
    setSelectedOrderId: setContextSelectedOrderId,
    partialErrors,
  } = useNiceHashOrders();

  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [orderDetail, setOrderDetail] = useState(null);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [switchingClient, setSwitchingClient] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [limitInput, setLimitInput] = useState("0.01");
  const [refillInput, setRefillInput] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "status", direction: "desc" });

  const requestSort = (key) => {
    let direction = "desc";
    if (sortConfig.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  // Orders filtered by selected client – each order has its own `nhClient`
  const orders = useMemo(() => {
    return nicehashOrders
      .map((r) => ({
        ...r.rawOrder,
        nhClient: r.account, // store the client that owns this order
      }))
      .filter((o) => {
        if (nhClient === "ALL") return true;
        return o.nhClient === nhClient;
      });
  }, [nicehashOrders, nhClient]);

  // Refresh – safely call context refresh (with or without client param)
  const handleManualRefresh = useCallback(async () => {
    setSwitchingClient(true);
    try {
      // Check if the refresh function expects a parameter
      if (refreshSummary.length > 0) {
        await refreshSummary(nhClient);
      } else {
        await refreshSummary();
      }
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setSwitchingClient(false);
    }
  }, [refreshSummary, nhClient]);

  // Fetch order detail – uses the order's own client
  const fetchOrderDetail = async (orderId) => {
    const id = String(orderId || "").trim();
    if (!id) return;

    // Find the order in the current list to get its client
    const existingOrder = nicehashOrders.find((r) => r.id === id);
    const client = existingOrder?.account || nhClient; // fallback to global if not found

    setLoadingLocal(true);
    try {
      const url = `/api/v2/hashpower/order/${encodeURIComponent(id)}?client=${encodeURIComponent(client)}`;
      const data = await onCall(url, { silent: true });
      if (data && !data.error) {
        setOrderDetail({ ...data, nhClient: client });
        setPriceInput(data.price || "");
        setLimitInput(data.limit || "");
      }
    } catch (error) {
      console.error("Error fetching order detail:", error);
    } finally {
      setLoadingLocal(false);
    }
  };

  // Client change handler
  const handleClientChange = (e) => {
    const newClient = e.target.value;
    setNhClient(newClient);
    setSelectedOrderId("");
    setOrderDetail(null);
    setContextSelectedOrderId("");
  };

  const handleOrderSelect = (value) => {
    setSelectedOrderId(value);
    setContextSelectedOrderId(value);
    const existing = nicehashOrders.find((r) => r.id === String(value));
    if (existing?.rawOrder) {
      setOrderDetail({ ...existing.rawOrder, nhClient: existing.account });
      setPriceInput(existing.rawOrder.price || "");
      setLimitInput(existing.rawOrder.limit || "");
    }
    if (value) {
      fetchOrderDetail(value);
    } else {
      setOrderDetail(null);
      setPriceInput("");
      setLimitInput("");
    }
  };

  // Get the client for a given order ID (helper)
  const getOrderClient = (orderId) => {
    return orderDetail?.nhClient || nicehashOrders.find(r => r.id === String(orderId))?.account;
  };

  // Cancel order – uses order's client
  const cancelOrder = () => {
    if (!selectedOrderId) return;
    const client = getOrderClient(selectedOrderId);
    if (!client) {
      alert("Unable to determine client for this order.");
      return;
    }
    if (!window.confirm(`Are you sure you want to cancel this order (client: ${client})?`)) return;

    const url = `/api/v2/hashpower/order/${encodeURIComponent(selectedOrderId)}?client=${encodeURIComponent(client)}`;
    onCall(url, {
      method: "DELETE",
      showModal: true,
    }).then((res) => {
      if (res && !res.error) handleManualRefresh();
    });
  };

  // Update order – uses order's client
  const updateOrder = () => {
    if (!selectedOrderId || priceInput === "" || limitInput === "") {
      alert("Order selection, Price, and Limit are required.");
      return;
    }
    const client = getOrderClient(selectedOrderId);
    if (!client) {
      alert("Unable to determine client for this order.");
      return;
    }
    const url = `/api/v2/hashpower/order/${encodeURIComponent(selectedOrderId)}/update?client=${encodeURIComponent(client)}`;
    onCall(url, {
      method: "POST",
      body: { price: String(priceInput), limit: String(limitInput) },
      showModal: true,
    }).then((res) => {
      if (res && !res.errors && !res.error) handleManualRefresh();
    });
  };

  // Refill order – uses order's client
  const refillOrder = () => {
    if (!selectedOrderId || !refillInput) return;
    const client = getOrderClient(selectedOrderId);
    if (!client) {
      alert("Unable to determine client for this order.");
      return;
    }
    const url = `/api/v2/hashpower/order/${encodeURIComponent(selectedOrderId)}/refill?client=${encodeURIComponent(client)}`;
    onCall(url, {
      method: "POST",
      body: { amount: String(refillInput) },
      showModal: true,
    }).then((res) => {
      if (res && !res.error) handleManualRefresh();
    });
  };

  // Sorted orders
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      let aVal, bVal;
      const key = sortConfig.key;
      if (key === "status") {
        aVal = (a.status?.code || a.status) === "ACTIVE" ? 1 : 0;
        bVal = (b.status?.code || b.status) === "ACTIVE" ? 1 : 0;
      } else if (key === "speed") {
        aVal = parseFloat(a.acceptedCurrentSpeed || 0);
        bVal = parseFloat(b.acceptedCurrentSpeed || 0);
      } else if (key === "algo") {
        aVal = (typeof a.algorithm === "object" ? a.algorithm.algorithm : a.algorithm) || "";
        bVal = (typeof b.algorithm === "object" ? b.algorithm.algorithm : b.algorithm) || "";
      } else if (key === "pool") {
        aVal = a.pool?.name || a.pool?.stratumHostname || a.title || a.name || "N/A";
        bVal = b.pool?.name || b.pool?.stratumHostname || b.title || b.name || "N/A";
      } else if (key === "price") {
        aVal = parseFloat(a.price || 0);
        bVal = parseFloat(b.price || 0);
      } else if (key === "account") {
        aVal = a.nhClient || "";
        bVal = b.nhClient || "";
      }
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [orders, sortConfig]);

  // Auto-refresh on client change
  useEffect(() => {
    if (nhClient && typeof onCall === "function") {
      handleManualRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nhClient, onCall]);

  // If context is not ready, show a loading message
  if (!nicehashOrders) {
    return <div style={{ padding: "20px", color: "#94a3b8" }}>Loading NiceHash orders...</div>;
  }

  return (
    <div className="nh-order-manager" style={{ padding: "12px", maxWidth: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <select
            className="select-pro"
            value={nhClient}
            onChange={handleClientChange}
            style={{ fontSize: "clamp(10px, 1vw, 12px)", padding: "4px 8px", minWidth: "120px", backgroundColor: "rgba(255,255,255,0.03)" }}
          >
            <option value="ALL">🌐 All Clients</option>
            <option value="BT">BT</option>
            <option value="PH">PH</option>
            <option value="PH3">PH3</option>
            <option value="HUDA">HUDA</option>
            <option value="XT">XT</option>
            <option value="LN">LN</option>
            <option value="NHATLINH">NhatLinh</option>
          </select>
          <NiceHashOrdersCardView />
        </div>
        {switchingClient && <span style={{ fontSize: "10px", color: "#fbbf24" }}>⏳ Switching...</span>}
      </div>

      {/* Partial failures warning (e.g. one account with invalid credentials) */}
      {partialErrors && partialErrors.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "8px 12px", marginBottom: "12px", fontSize: "11px", color: "#fca5a5" }}>
          ⚠️ {partialErrors.length} account(s) failed to load:{" "}
          {partialErrors.map((e) => `${e?.client || e?.account || "?"}: ${e?.message || "error"}`).join("; ")}
        </div>
      )}

      {/* Quick Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: "8px", marginBottom: "16px" }}>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "6px", textAlign: "center" }}>
          <div style={{ fontSize: "9px", opacity: 0.5 }}>Active</div>
          <div style={{ fontSize: "clamp(14px, 1.5vw, 18px)", fontWeight: "bold", color: "#10b981" }}>
            {orders.filter(o => (o.status?.code || o.status) === "ACTIVE").length}
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "6px", textAlign: "center" }}>
          <div style={{ fontSize: "9px", opacity: 0.5 }}>Total Paid</div>
          <div style={{ fontSize: "clamp(14px, 1.5vw, 18px)", fontWeight: "bold", color: "#fbbf24" }}>
            {summary?.totalPaid?.toFixed?.(8) || summary?.totalPaid || "0.00000000"} BTC
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "6px", textAlign: "center" }}>
          <div style={{ fontSize: "9px", opacity: 0.5 }}>Orders</div>
          <div style={{ fontSize: "clamp(14px, 1.5vw, 18px)", fontWeight: "bold", color: "#60a5fa" }}>
            {summary?.count || orders.length}
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "6px", textAlign: "center" }}>
          <div style={{ fontSize: "9px", opacity: 0.5 }}>Inactive</div>
          <div style={{ fontSize: "clamp(14px, 1.5vw, 18px)", fontWeight: "bold", color: "#f87171" }}>
            {orders.filter(o => (o.status?.code || o.status) !== "ACTIVE").length}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
        <button className="btn-pro secondary" onClick={() => onCall(`/api/v2/mining/address?client=${encodeURIComponent(nhClient)}`)} style={{ fontSize: "clamp(9px, 0.8vw, 11px)", padding: "4px 10px" }}>📍 Address</button>
        <button className="btn-pro secondary" onClick={() => onCall(`/api/v2/algorithms?client=${encodeURIComponent(nhClient)}`)} style={{ fontSize: "clamp(9px, 0.8vw, 11px)", padding: "4px 10px" }}>📊 Algorithms</button>
        <button className="btn-pro secondary" onClick={() => onCall(`/api/v2/mining/payouts?client=${encodeURIComponent(nhClient)}`)} style={{ fontSize: "clamp(9px, 0.8vw, 11px)", padding: "4px 10px" }}>💰 Payouts</button>
        <button className="btn-pro secondary" onClick={() => onCall(`/api/v2/mining/history?client=${encodeURIComponent(nhClient)}`)} style={{ fontSize: "clamp(9px, 0.8vw, 11px)", padding: "4px 10px" }}>📈 History</button>
        <button className="btn-pro secondary" onClick={handleManualRefresh} style={{ fontSize: "clamp(10px, 1vw, 12px)", padding: "4px 12px" }}>
          🔄 Refresh
        </button>
      </div>

      {/* Order Selection */}
      <div style={{ marginBottom: "12px" }}>
        <select
          className="select-pro"
          value={selectedOrderId}
          onChange={(e) => handleOrderSelect(e.target.value)}
          style={{ width: "100%", fontSize: "clamp(11px, 1vw, 13px)", padding: "6px 10px" }}
        >
          <option value="">📋 Select Order</option>
          {sortedOrders.some((o) => (o.status?.code || o.status) !== "ACTIVE") && (
            <option disabled>--- Active Orders ---</option>
          )}
          {sortedOrders.map((order, index) => {
            const id = String(order?.id ?? order?.orderId ?? order?.hashpowerOrderId ?? "");
            const algoName = typeof order?.algorithm === "object" ? order.algorithm.algorithm || order.algorithm.displayName : order?.algorithm;
            const poolName = order?.pool?.name || order?.pool?.stratumHostname;
            const algoInfo = getAlgoMapping(algoName);
            const label = poolName ? `${poolName} (${algoInfo.displayName || "N/A"})` : algoInfo.displayName || order?.title || order?.name || `Order ${index + 1}`;
            const statusCode = String(order?.status?.code || order?.status || "").toUpperCase();
            const clientSuffix = order?.nhClient ? ` [${order.nhClient}]` : "";
            const isInactive = statusCode !== "ACTIVE";
            const prevOrder = sortedOrders[index - 1];
            const showSeparator = isInactive && prevOrder && (prevOrder.status?.code || prevOrder.status) === "ACTIVE";
            return (
              <React.Fragment key={id || `${label}-${index}`}>
                {showSeparator && <option disabled>--- Recent Inactive ---</option>}
                <option value={id}>{label}{statusCode ? ` [${statusCode}]` : ""}{clientSuffix}</option>
              </React.Fragment>
            );
          })}
        </select>

        {/* Order Status & Price */}
        {orderDetail?.status?.code && (
          <div style={{ padding: "6px 0", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span className={orderDetail.status.code === "ACTIVE" ? "status-success" : "status-ready"} style={{ fontSize: "10px", fontWeight: "bold" }}>
              {orderDetail.status.code}
            </span>
            {getOrderPrice(selectedOrderId) !== null && (
              <span style={{ fontSize: "11px", opacity: 0.7 }}>Price: <strong style={{ color: "#f59e0b" }}>{getOrderPrice(selectedOrderId)} BTC/TH</strong></span>
            )}
            {nicehashOrders.find((r) => r.id === String(selectedOrderId))?.orderDiff && (
              <span style={{ fontSize: "10px", fontWeight: "bold", color: parseFloat(nicehashOrders.find((r) => r.id === String(selectedOrderId))?.orderDiff || 0) >= 0 ? "#10b981" : "#f87171" }}>
                (({parseFloat(nicehashOrders.find((r) => r.id === String(selectedOrderId))?.orderDiff || 0) > 0 ? "+" : ""}{nicehashOrders.find((r) => r.id === String(selectedOrderId))?.orderDiff || 0}).toFixed(4)%)
              </span>
            )}
            {nicehashOrders.find((r) => r.id === String(selectedOrderId))?.marketPrice > 0 && (
              <span style={{ fontSize: "10px", opacity: 0.6 }}>
                Market: <strong style={{ color: "#60a5fa" }}>{parseFloat(nicehashOrders.find((r) => r.id === String(selectedOrderId))?.marketPrice || 0).toFixed(8)} BTC/{nicehashOrders.find((r) => r.id === String(selectedOrderId))?.marketUnit}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Order Management Panel – uses order's client */}
      {selectedOrderId && (
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)", padding: "12px", marginBottom: "16px" }}>
          {nhClient === "ALL" && (
            <div style={{ fontSize: "10px", color: "#fbbf24", marginBottom: "8px" }}>
              ⚠️ Actions will apply to the selected order's owning client.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "8px", alignItems: "flex-end", marginBottom: "10px" }}>
            <div>
              <label style={{ fontSize: "9px", opacity: 0.6, display: "block", marginBottom: "2px" }}>NEW PRICE</label>
              <input type="number" className="input-pro" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="0.0000" step="0.0001" style={{ width: "100%", padding: "4px 8px", fontSize: "11px" }} />
            </div>
            <div>
              <label style={{ fontSize: "9px", opacity: 0.6, display: "block", marginBottom: "2px" }}>NEW LIMIT</label>
              <input type="number" className="input-pro" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} placeholder="0.00" step="0.01" style={{ width: "100%", padding: "4px 8px", fontSize: "11px" }} />
            </div>
            <button className="btn-pro primary" onClick={updateOrder} style={{ padding: "6px 12px", fontSize: "11px", minHeight: "32px" }}>Update</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "flex-end", marginBottom: "10px" }}>
            <div>
              <label style={{ fontSize: "9px", opacity: 0.6, display: "block", marginBottom: "2px" }}>REFILL AMOUNT</label>
              <input type="number" className="input-pro" value={refillInput} onChange={(e) => setRefillInput(e.target.value)} placeholder="0.0000" step="0.0001" style={{ width: "100%", padding: "4px 8px", fontSize: "11px" }} />
            </div>
            <button className="btn-pro" onClick={refillOrder} style={{ background: "#10b981", padding: "6px 12px", fontSize: "11px", minHeight: "32px" }}>Refill</button>
          </div>
          <button className="btn-pro status-error" onClick={cancelOrder} style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)", width: "100%", padding: "6px", fontSize: "11px" }}>Cancel Order</button>
        </div>
      )}

      {/* Price Lookup Modal Toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <input type="checkbox" id="showPriceLookupModalToggle" checked={showPriceLookupModal} onChange={(e) => setShowPriceLookupModal(e.target.checked)} />
        <label htmlFor="showPriceLookupModalToggle" style={{ fontSize: "11px", opacity: 0.8, cursor: "pointer" }}>Show Price Lookup Modal</label>
      </div>

      {loadingLocal && <div style={{ fontSize: "11px", opacity: 0.6, margin: "8px 0" }}>Fetching order data...</div>}

      {/* Main Content Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px", marginTop: "12px" }}>
        {/* Order Detail */}
        {orderDetail && (
          <div style={{ background: "rgba(59,130,246,0.05)", borderRadius: "8px", border: "1px solid rgba(59,130,246,0.2)", padding: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h4 style={{ margin: 0, color: "#3b82f6", fontSize: "clamp(12px, 1.2vw, 14px)" }}>📋 Order Info</h4>
              <button className="btn-pro secondary" style={{ fontSize: "10px", padding: "2px 8px" }} onClick={() => setOrderDetail(null)}>✕</button>
            </div>
            <div style={{ marginBottom: "10px", paddingBottom: "8px", borderBottom: "1px solid rgba(59, 130, 246, 0.1)" }}>
              <div style={{ opacity: 0.5, fontSize: "9px", textTransform: "uppercase" }}>POOL</div>
              <div style={{ fontSize: "clamp(11px, 1vw, 13px)", fontWeight: "bold", color: "#e2e8f0", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {orderDetail.pool?.name || orderDetail.pool?.stratumHostname || 'N/A'}
              </div>
            </div>
            {orderDetail?.nhClient && (
              <div style={{ marginBottom: "10px", paddingBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ opacity: 0.5, fontSize: "9px", textTransform: "uppercase" }}>ACCOUNT</div>
                <div style={{ fontSize: "clamp(16px, 1.5vw, 20px)", fontWeight: "bold", color: "#60a5fa" }}>{orderDetail.nhClient}</div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "8px", fontSize: "10px" }}>
              <div><span style={{ opacity: 0.6, display: "block", fontSize: "8px" }}>STATUS</span><strong style={{ color: orderDetail.status?.code === "ACTIVE" ? "#10b981" : "#f87171" }}>{orderDetail.status?.code}</strong></div>
              <div><span style={{ opacity: 0.6, display: "block", fontSize: "8px" }}>ALGO</span><strong>{typeof orderDetail.algorithm === "object" ? orderDetail.algorithm.algorithm : orderDetail.algorithm}</strong></div>
              <div><span style={{ opacity: 0.6, display: "block", fontSize: "8px" }}>MARKET</span><strong>{orderDetail.market}</strong></div>
              <div><span style={{ opacity: 0.8, display: "block", fontSize: "8px" }}>PRICE</span><strong style={{ color: "#f59e0b" }}>{orderDetail.price}</strong></div>
              <div><span style={{ opacity: 0.6, display: "block", fontSize: "8px" }}>SPEED</span><strong style={{ color: "#10b981" }}>{parseFloat(orderDetail.acceptedCurrentSpeed || 0).toFixed(4)}</strong></div>
              <div><span style={{ opacity: 0.6, display: "block", fontSize: "8px" }}>LIMIT</span><strong>{orderDetail.limit}</strong></div>
              <div><span style={{ opacity: 0.6, display: "block", fontSize: "8px" }}>REMAINING</span><strong>{parseFloat(orderDetail.availableAmount || 0).toFixed(8)}</strong></div>
              <div><span style={{ opacity: 0.6, display: "block", fontSize: "8px" }}>MINER</span><strong>{orderDetail.rigsCount}</strong></div>
            </div>
          </div>
        )}

        {/* Orders List */}
        {orders.length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)", padding: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h4 style={{ margin: 0, fontSize: "clamp(11px, 1vw, 13px)", opacity: 0.8 }}>📊 My Orders</h4>
              <button className="btn-pro secondary" style={{ fontSize: "9px", padding: "2px 8px" }} onClick={handleManualRefresh}>Refresh</button>
            </div>
            <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px" }}>
              <table style={{ width: "100%", fontSize: "clamp(9px, 0.8vw, 10px)", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "rgba(15,23,42,0.95)" }}>
                  <tr>
                    <th style={{ padding: "6px", cursor: "pointer" }} onClick={() => requestSort("pool")}>POOL {sortConfig.key === "pool" ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}</th>
                    <th style={{ padding: "6px", cursor: "pointer" }} onClick={() => requestSort("algo")}>ALGO {sortConfig.key === "algo" ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}</th>
                    {nhClient === "ALL" && <th style={{ padding: "6px" }}>ACCT</th>}
                    <th style={{ padding: "6px", textAlign: "right", cursor: "pointer" }} onClick={() => requestSort("price")}>PRICE {sortConfig.key === "price" ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}</th>
                    <th style={{ padding: "6px", textAlign: "right", cursor: "pointer" }} onClick={() => requestSort("speed")}>SPEED {sortConfig.key === "speed" ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOrders.map((o, i) => {
                    const id = o.id || o.orderId || o.hashpowerOrderId;
                    const algo = typeof o.algorithm === "object" ? o.algorithm.algorithm : o.algorithm;
                    const speedUnit = getNiceHashUnit(algo);
                    const speedInDisplayUnit = convertUnit(parseFloat(o.acceptedCurrentSpeed || 0), 'H', speedUnit);
                    const poolName = o.pool?.name || o.pool?.stratumHostname || o.title || o.name || "N/A";
                    return (
                      <tr key={id || i} onClick={() => handleOrderSelect(id)} style={{ cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                        <td style={{ padding: "6px" }}>{poolName}</td>
                        <td style={{ padding: "6px" }}>{algo}</td>
                        {nhClient === "ALL" && <td style={{ padding: "6px", opacity: 0.7 }}>{o.nhClient}</td>}
                        <td style={{ padding: "6px", textAlign: "right", color: "#f59e0b" }}>{o.price}</td>
                        <td style={{ padding: "6px", textAlign: "right" }}>{speedInDisplayUnit.toFixed(4)} {speedUnit}/s</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <CryptoRatePage onCall={onCall} />
      </div>
    </div>
  );
}

export default function MiningRigNiceHash({ onCall, algorithm, nhClient, setNhClient }) {
  return (
    <div style={{ padding: "12px", maxWidth: "100%", overflow: "hidden" }}>
      <h3 style={{ paddingBottom: "12px", marginBottom: "12px", borderBottom: "1px solid rgba(148,163,184,0.1)", fontSize: "clamp(14px, 1.3vw, 18px)" }}>
        ⚡ NiceHash Order Management
      </h3>
      <NiceHashOrderManager onCall={onCall} nhClient={nhClient} setNhClient={setNhClient} algorithm={algorithm} />
    </div>
  );
}

// ============================================================
// ✅ UPGRADED: Active Orders Card View (with scroll & +X more)
// ============================================================
function NiceHashOrdersCardView() {
  const { nicehashOrders, summary, loading } = useNiceHashOrders();
  const activeOrders = useMemo(
    () => nicehashOrders.filter((order) => order.isActive),
    [nicehashOrders]
  );

  const MAX_VISIBLE = 7; // Số lượng order hiển thị trực tiếp
  const visibleOrders = activeOrders.slice(0, MAX_VISIBLE);
  const remainingCount = activeOrders.length - MAX_VISIBLE;

  return (
    <div
      style={{
        padding: "6px 12px",
        background: "rgba(255,255,255,0.02)",
        borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.05)",
        flex: "1 1 100%",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      {/* Header: tổng quan */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "4px",
        }}
      >
        <span style={{ fontSize: "clamp(9px, 0.8vw, 11px)", fontWeight: "bold" }}>
          🟢 Active Orders
        </span>
        <span style={{ fontSize: "clamp(8px, 0.7vw, 10px)", opacity: 0.6 }}>
          Paid:{" "}
          <span style={{ color: "#f3ba2f", fontWeight: "bold" }}>
            {summary?.totalPaid?.toFixed?.(8) || "0.00000000"} BTC
          </span>
          <span style={{ margin: "0 6px", opacity: 0.3 }}>|</span>
          Count: <b>{summary?.count || 0}</b>
        </span>
      </div>

      {/* Danh sách order – cuộn ngang */}
      {!loading && activeOrders.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "6px",
            overflowX: "auto",          // Cuộn ngang khi vượt quá chiều rộng
            width: "100%",
            minWidth: 0,
            paddingBottom: "4px",
            marginTop: "4px",
          }}
        >
          {visibleOrders.map((order) => (
            <NiceHashOrderCard key={order.id} order={order} />
          ))}
          {remainingCount > 0 && (
            <span
              style={{
                fontSize: "9px",
                opacity: 0.5,
                padding: "4px",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
              }}
            >
              +{remainingCount} more
            </span>
          )}
        </div>
      )}

      {!loading && activeOrders.length === 0 && (
        <span style={{ fontSize: "10px", opacity: 0.5 }}>No active orders</span>
      )}
      {loading && (
        <span style={{ fontSize: "10px", opacity: 0.5 }}>Loading...</span>
      )}
    </div>
  );
}