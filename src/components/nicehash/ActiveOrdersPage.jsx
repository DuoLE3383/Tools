import { useMemo } from "react";
import NiceHashOrderCard from "./NiceHashOrdersCard.jsx";
import { NiceHashOrderProvider, useNiceHashOrders } from "./NiceHashContext";

function ActiveOrdersView({ nhClient, setNhClient, onNavigateHome }) {
  const { nicehashOrders, summary, loading, refresh } = useNiceHashOrders();

  const activeOrders = useMemo(
    () => nicehashOrders.filter((o) => o.isActive),
    [nicehashOrders],
  );

  return (
    <main className="miner-page">
      <header className="miner-page-header">
        <div>
          <h1>Active Orders</h1>
          <p>NiceHash active orders — {activeOrders.length} running, {summary.totalPaid} BTC total paid</p>
        </div>
        <div className="miner-header-actions">
          <select
            className="select-pro"
            value={nhClient}
            onChange={(e) => setNhClient(e.target.value)}
            style={{ fontSize: "10px", padding: "4px 8px", width: "auto" }}
          >
            <option value="VN">VN (All)</option>
            <option value="BT">BT</option>
            <option value="PH">PH</option>
            <option value="NHATLINH">NhatLinh</option>
            <option value="LN">LN</option>
          </select>
          <button className="btn-pro primary" onClick={refresh} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button className="btn-pro secondary" onClick={onNavigateHome}>
            Back
          </button>
        </div>
      </header>

      {loading && activeOrders.length === 0 && (
        <div className="miner-empty panel">Loading active orders...</div>
      )}

      {!loading && activeOrders.length === 0 && (
        <div className="miner-empty panel">No active NiceHash orders found.</div>
      )}

      <section
        className="miner-account-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: "12px",
          marginTop: "16px",
        }}
      >
        {activeOrders.map((order) => (
          <NiceHashOrderCard key={order.id} order={order} />
        ))}
      </section>
    </main>
  );
}

export default function ActiveOrdersPage({ onCall, nhClient, setNhClient, onNavigateHome }) {
  return (
    <NiceHashOrderProvider nhClient={nhClient} callApi={onCall}>
      <ActiveOrdersView
        nhClient={nhClient}
        setNhClient={setNhClient}
        onNavigateHome={onNavigateHome}
      />
    </NiceHashOrderProvider>
  );
}
