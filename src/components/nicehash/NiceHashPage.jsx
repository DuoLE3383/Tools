import NiceHash from "./NiceHash";
import { NiceHashOrderProvider } from "./NiceHashContext";
import TelegramManager from "../TelegramManager";

export default function NiceHashPage({ onCall, nhClient, setNhClient, onNavigateHome }) {
  return (
    <main className="miner-page">
      <header className="miner-page-header">
        <div>
          <h1>NiceHash Dashboard</h1>
          <p>Order management, mining address, payouts, accounting and market rates</p>
        </div>
        <div className="miner-header-actions">
          <TelegramManager onCall={onCall} mrrClient="BT" />
          <button className="btn-pro secondary" onClick={() => window.location.href = "/mrr"}>MRR</button>
          <button className="btn-pro secondary" onClick={() => window.location.href = "/miner"}>Miner</button>
          <button className="btn-pro secondary" onClick={() => window.location.href = "/mining"}>Opportunities</button>
          <button className="btn-pro secondary" onClick={onNavigateHome}>
            Dashboard
          </button>
        </div>
      </header>

      <NiceHashOrderProvider nhClient={nhClient} callApi={onCall}>
        <article className="panel">
          <NiceHash
            key={nhClient}
            onCall={onCall}
            nhClient={nhClient}
            setNhClient={setNhClient}
          />
        </article>
      </NiceHashOrderProvider>
    </main>
  );
}
