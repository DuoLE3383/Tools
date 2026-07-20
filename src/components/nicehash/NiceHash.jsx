// NiceHash.jsx - RESPONSIVE FULL-WIDTH REDESIGN

import React, { useEffect, useMemo, useState, useCallback } from "react";
import Accounting from "../Accounting";
import CryptoRatePage from "../../../CryptoRatePage.jsx";
import NiceHashOrderCard from "./NiceHashOrdersCard.jsx";
import { getAlgoMapping, getNiceHashUnit, convertUnit, convertPrice, normalizeAlgo, ALGO_MAPPING, HASHRATE_SUFFIXES } from "../../core/mapping.js";
import { useNiceHashOrders } from "./NiceHashContext";

function NiceHashOrderManager({ onCall, nhClient, setNhClient }) {
  const {
    nicehashOrders,
    summary,
    refresh: refreshSummary,
    showPriceLookupModal,
    setShowPriceLookupModal,
    getOrderPrice,
    setSelectedOrderId: setContextSelectedOrderId,
  } = useNiceHashOrders();

  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [orderDetail, setOrderDetail] = useState(null);
  const [loadingLocal, setLoadingLocal] = useState(false);
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

  const orders = useMemo(() => {
    return nicehashOrders.map((r) => ({
      ...r.rawOrder,
      nhClient: r.account,
    }));
  }, [nicehashOrders]);

  const handleManualRefresh = useCallback(() => {
    refreshSummary();
  }, [refreshSummary]);

  const fetchOrderDetail = async (orderId) => {
    const id = String(orderId || "").trim();
    if (!id) return;
    setLoadingLocal(true);
    try {
      const data = await onCall(`/api/v2/hashpower/order/${encodeURIComponent(id)}`, { silent: true });
      if (data && !data.error) {
        const contextMatch = nicehashOrders.find((r) => r.id === id);
        setOrderDetail({ ...data, nhClient: contextMatch?.account || nhClient });
        // Only overwrite price/limit from API if they actually exist (not a 403-warning response)
        if (data.price !== undefined && data.price !== "") {
          setPriceInput(data.price);
        }
        if (data.limit !== undefined && data.limit !== "") {
          setLimitInput(data.limit);
        }
      }
      return data; // Return for .then() chain
    } catch (error) {
      console.error("Error fetching order detail:", error);
      return { error: error.message };
    } finally {
      setLoadingLocal(false);
    }
  };

  const handleOrderSelect = (value) => {
    setSelectedOrderId(value);
    setContextSelectedOrderId(value);
    // Always set local data first from context (has price/limit)
    const existing = nicehashOrders.find((r) => r.id === String(value));
    if (existing?.rawOrder) {
      setOrderDetail({ ...existing.rawOrder, nhClient: existing.account });
      setPriceInput(existing.rawOrder.price || "");
      setLimitInput(existing.rawOrder.limit || "");
    }
    if (value) {
      // Fetch fresh detail from server, but preserve price/limit from local data
      fetchOrderDetail(value).then((data) => {
        if (data && !data.error && existing?.rawOrder) {
          // Keep the local price/limit if the API response is a warning/partial response
          if (data.warning || !data.price) {
            setPriceInput(existing.rawOrder.price || "");
            setLimitInput(existing.rawOrder.limit || "");
          }
        }
      });
    } else {
      setOrderDetail(null);
      setPriceInput("");
      setLimitInput("");
    }
  };

  const cancelOrder = () => {
    if (!selectedOrderId || !window.confirm("Are you sure you want to cancel this order?")) return;
    onCall(`/api/v2/hashpower/order/${encodeURIComponent(selectedOrderId)}`, {
      method: "DELETE",
      showModal: true,
    }).then((res) => {
      if (res && !res.error) refreshSummary();
    });
  };

  const updateOrder = () => {
    if (!selectedOrderId || priceInput === "" || limitInput === "") {
      alert("Order selection, Price, and Limit are required.");
      return;
    }
    onCall(`/api/v2/hashpower/order/${encodeURIComponent(selectedOrderId)}/update`, {
      method: "POST",
      body: { price: String(priceInput), limit: String(limitInput) },
      showModal: true,
    }).then((res) => {
      if (res && !res.errors && !res.error) refreshSummary();
    });
  };

  const refillOrder = () => {
    if (!selectedOrderId || !refillInput) return;
    onCall(`/api/v2/hashpower/order/${encodeURIComponent(selectedOrderId)}/refill`, {
      method: "POST",
      body: { amount: String(refillInput) },
      showModal: true,
    }).then((res) => {
      if (res && !res.error) refreshSummary();
    });
  };

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

  const contextOrderPrice = useMemo(() => {
    if (!selectedOrderId) return null;
    return getOrderPrice(selectedOrderId);
  }, [selectedOrderId, getOrderPrice]);

  const matchingOrderInfo = useMemo(
    () => nicehashOrders.find((r) => r.id === String(selectedOrderId)),
    [nicehashOrders, selectedOrderId],
  );

  useEffect(() => {
    if (nhClient && typeof onCall === "function") {
      refreshSummary();
    }
  }, [nhClient, onCall, refreshSummary]);

  return (
    <div className="nh-order-manager" style={{ padding: "12px", maxWidth: "100%", overflow: "hidden" }}>
      {/* Header - Client Selection & Summary */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <select
            className="select-pro"
            value={nhClient}
            onChange={(e) => setNhClient(e.target.value)}
            style={{ fontSize: "clamp(10px, 1vw, 12px)", padding: "4px 8px", minWidth: "120px", backgroundColor: "rgba(255,255,255,0.03)" }}
          >
            <option value="VN">🌐 All Clients</option>
            <option value="BT">BT</option>
            <option value="PH">PH</option>
            <option value="PH3">PH3</option>
            <option value="HUDA">HUDA</option>
            <option value="LN">LN</option>
            <option value="NHATLINH">NhatLinh</option>
          </select>
          <NiceHashOrdersCardView />
        </div>
        
      </div>

      {/* Quick Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: "8px", marginBottom: "16px" }}>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "6px", textAlign: "center" }}>
          <div style={{ fontSize: "9px", opacity: 0.5 }}>Active</div>
          <div style={{ fontSize: "clamp(14px, 1.5vw, 18px)", fontWeight: "bold", color: "#10b981" }}>
            {nicehashOrders.filter(o => o.isActive).length}
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "6px", textAlign: "center" }}>
          <div style={{ fontSize: "9px", opacity: 0.5 }}>Total Paid</div>
          <div style={{ fontSize: "clamp(14px, 1.5vw, 18px)", fontWeight: "bold", color: "#fbbf24" }}>
            {summary.totalPaid} BTC
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "6px", textAlign: "center" }}>
          <div style={{ fontSize: "9px", opacity: 0.5 }}>Orders</div>
          <div style={{ fontSize: "clamp(14px, 1.5vw, 18px)", fontWeight: "bold", color: "#60a5fa" }}>
            {nicehashOrders.length}
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "6px", textAlign: "center" }}>
          <div style={{ fontSize: "9px", opacity: 0.5 }}>Inactive</div>
          <div style={{ fontSize: "clamp(14px, 1.5vw, 18px)", fontWeight: "bold", color: "#f87171" }}>
            {nicehashOrders.filter(o => !o.isActive).length}
          </div>
        </div>
      </div>

      {/* Rate Comparison: NiceHash vs MRR (ALGO_MAPPING-driven units) */}
      {(() => {
        // Pick the algorithm with the most active orders
        const algoOrderCounts = {};
        nicehashOrders.forEach(o => {
          if (!o.isActive) return;
          const rawAlgo = typeof o.rawOrder?.algorithm === "object" ? o.rawOrder.algorithm.algorithm : o.algo || '';
          const key = normalizeAlgo(rawAlgo);
          algoOrderCounts[key] = (algoOrderCounts[key] || 0) + 1;
        });
        const topAlgo = Object.keys(algoOrderCounts).sort((a,b) => algoOrderCounts[b] - algoOrderCounts[a])[0];
        if (!topAlgo) return null;
        
        const mapping = ALGO_MAPPING[topAlgo];
        if (!mapping) return null;

        const nhUnit = mapping.niceHashUnit || 'TH';
        const mrrUnitCol = mapping.mrrUnit || 'GH';
        const displayName = mapping.displayName;
        
        // MRR reference rate: 0.00001495 BTC/GH/Day
        // Both rates in a common base unit (TH) for comparison
        const mrrRateTH = convertPrice(0.00001495, mrrUnitCol, 'TH');
        
        // Average NH price from active orders, convert to TH
        const activeForAlgo = nicehashOrders.filter(o => {
          if (!o.isActive) return false;
          const rawAlgo = typeof o.rawOrder?.algorithm === "object" ? o.rawOrder.algorithm.algorithm : o.algo || '';
          return normalizeAlgo(rawAlgo) === topAlgo;
        });
        const avgNh = activeForAlgo.reduce((s, o) => s + parseFloat(o.price || 0), 0) / activeForAlgo.length;
        const nhInTH = convertPrice(avgNh || 0, nhUnit, 'TH');
        
        const diffPct = mrrRateTH > 0 ? ((nhInTH - mrrRateTH) / mrrRateTH) * 100 : 0;
        const better = diffPct >= 0 ? "NiceHash" : "MRR";
        const betterColor = diffPct >= 0 ? "#f59e0b" : "#10b981";

        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", marginBottom: "12px" }}>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", padding: "8px 10px", borderRadius: "6px", textAlign: "center" }}>
              <div style={{ fontSize: "8px", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.5px" }}>NiceHash • {displayName}</div>
              <div style={{ fontSize: "clamp(13px, 1.2vw, 16px)", fontWeight: "bold", color: "#f59e0b" }}>
                {avgNh.toFixed(6)} BTC/{nhUnit}
              </div>
              <div style={{ fontSize: "8px", opacity: 0.4 }}>per day</div>
            </div>
            <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", padding: "8px 10px", borderRadius: "6px", textAlign: "center" }}>
              <div style={{ fontSize: "8px", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.5px" }}>MRR Rate • {displayName}</div>
              <div style={{ fontSize: "clamp(13px, 1.2vw, 16px)", fontWeight: "bold", color: "#10b981" }}>
                0.00001495 BTC/{mrrUnitCol}
              </div>
              <div style={{ fontSize: "8px", opacity: 0.4 }}>per day</div>
            </div>
            <div style={{ background: `rgba(16,185,129,0.06)`, border: `1px solid ${betterColor}33`, padding: "8px 10px", borderRadius: "6px", textAlign: "center" }}>
              <div style={{ fontSize: "8px", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.5px" }}>PNL (NH vs MRR)</div>
              <div style={{ fontSize: "clamp(13px, 1.2vw, 16px)", fontWeight: "bold", color: diffPct >= 0 ? "#10b981" : "#f87171" }}>
                {diffPct >= 0 ? "+" : ""}{diffPct.toFixed(1)}%
              </div>
              <div style={{ fontSize: "8px", opacity: 0.5 }}>
                <span style={{ color: betterColor, fontWeight: "bold" }}>{better}</span> is better
              </div>
            </div>
          </div>
        );
      })()}

      {/* Quick Action Buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
        <button className="btn-pro secondary" onClick={() => onCall("/api/v2/mining/address")} style={{ fontSize: "clamp(9px, 0.8vw, 11px)", padding: "4px 10px" }}>📍 Address</button>
        <button className="btn-pro secondary" onClick={() => onCall("/api/v2/algorithms")} style={{ fontSize: "clamp(9px, 0.8vw, 11px)", padding: "4px 10px" }}>📊 Algorithms</button>
        <button className="btn-pro secondary" onClick={() => onCall("/api/v2/mining/payouts")} style={{ fontSize: "clamp(9px, 0.8vw, 11px)", padding: "4px 10px" }}>💰 Payouts</button>
        <button className="btn-pro secondary" onClick={() => onCall("/api/v2/mining/history", { query: { algorithm } })} style={{ fontSize: "clamp(9px, 0.8vw, 11px)", padding: "4px 10px" }}>📈 History</button>
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
            {contextOrderPrice !== null && (
              <span style={{ fontSize: "11px", opacity: 0.7 }}>Price: <strong style={{ color: "#f59e0b" }}>{contextOrderPrice} BTC/TH</strong></span>
            )}
            {matchingOrderInfo?.orderDiff && (
              <span style={{ fontSize: "10px", fontWeight: "bold", color: parseFloat(matchingOrderInfo.orderDiff) >= 0 ? "#10b981" : "#f87171" }}>
                ({parseFloat(matchingOrderInfo.orderDiff) > 0 ? "+" : ""}{matchingOrderInfo.orderDiff}%)
              </span>
            )}
            {matchingOrderInfo?.marketPrice > 0 && (
              <span style={{ fontSize: "10px", opacity: 0.6 }}>
                Market: <strong style={{ color: "#60a5fa" }}>{parseFloat(matchingOrderInfo.marketPrice).toFixed(8)} BTC/{matchingOrderInfo.marketUnit}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Order Management Panel */}
      {selectedOrderId && (
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)", padding: "12px", marginBottom: "16px" }}>
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

      {/* Main Content Grid - Responsive */}
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
              <button className="btn-pro secondary" style={{ fontSize: "9px", padding: "2px 8px" }} onClick={refreshSummary}>Refresh</button>
            </div>
            <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px" }}>
              <table style={{ width: "100%", fontSize: "clamp(9px, 0.8vw, 10px)", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "rgba(15,23,42,0.95)" }}>
                  <tr>
                    <th style={{ padding: "6px", cursor: "pointer" }} onClick={() => requestSort("pool")}>POOL {sortConfig.key === "pool" ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}</th>
                    <th style={{ padding: "6px", cursor: "pointer" }} onClick={() => requestSort("algo")}>ALGO {sortConfig.key === "algo" ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}</th>
                    {nhClient === "VN" && <th style={{ padding: "6px" }}>ACCT</th>}
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
                        {nhClient === "VN" && <td style={{ padding: "6px", opacity: 0.7 }}>{o.nhClient}</td>}
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

        {/* CryptoRatePage */}
        <CryptoRatePage onCall={onCall} />
      </div>

      {/* Accounting Section */}
      {/* <div style={{ marginTop: "20px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "clamp(13px, 1.2vw, 16px)" }}>💰 Accounting & Wallet</h3>
        </div>
        <Accounting onCall={onCall} />
      </div> */}
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

// Helper component for Active Orders Card View
function NiceHashOrdersCardView() {
  const { nicehashOrders, summary, loading } = useNiceHashOrders();
  const activeOrders = useMemo(() => nicehashOrders.filter((order) => order.isActive), [nicehashOrders]);

  return (
    <div style={{ padding: "6px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
        <span style={{ fontSize: "clamp(9px, 0.8vw, 11px)", fontWeight: "bold" }}>🟢 Active Orders</span>
        <span style={{ fontSize: "clamp(8px, 0.7vw, 10px)", opacity: 0.6 }}>
          Paid: <span style={{ color: "#f3ba2f", fontWeight: "bold" }}>{summary.totalPaid} BTC</span>
          <span style={{ margin: "0 6px", opacity: 0.3 }}>|</span>
          Count: <b>{summary.count}</b>
        </span>
      </div>
      {!loading && activeOrders.length > 0 && (
        <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px", marginTop: "4px" }}>
          {activeOrders.slice(0, 7).map((order) => (
            <NiceHashOrderCard key={order.id} order={order} />
          ))}
          {activeOrders.length > 7 && <span style={{ fontSize: "9px", opacity: 0.5, padding: "4px" }}>+{activeOrders.length - 5} more</span>}
        </div>
      )}
      {!loading && activeOrders.length === 0 && <span style={{ fontSize: "10px", opacity: 0.5 }}>No active orders</span>}
      {loading && <span style={{ fontSize: "10px", opacity: 0.5 }}>Loading...</span>}
    </div>
  );
}
