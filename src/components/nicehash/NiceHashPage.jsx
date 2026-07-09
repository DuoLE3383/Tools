import NiceHash from "./NiceHash";
import { NiceHashOrderProvider } from "./NiceHashContext";
import TelegramManager from "../TelegramManager";
import NavBar from "../NavBar";

export default function NiceHashPage({ onCall, nhClient, setNhClient, onNavigateHome }) {
  const pathname = window.location.pathname || "/";
  return (
    <main className="miner-page">
      <NavBar currentPath={pathname} />
      <header className="miner-page-header">
        <div>
          <h1>NiceHash Dashboard</h1>
          <p>Order management, mining address, payouts, accounting and market rates</p>
        </div>
        <div className="miner-header-actions">
          <TelegramManager onCall={onCall} mrrClient="BT" />
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
