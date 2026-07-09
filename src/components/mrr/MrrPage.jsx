import { useCallback, useState } from "react";
import MiningRigRental from "./MiningRigRental";
import { RentedRigProvider } from "./RentedRigContext.jsx";
import { NiceHashOrderProvider } from "../nicehash/NiceHashContext.jsx";
import MrrPoolsManager from "./MrrManager";
import TelegramManager from "../TelegramManager";
import NavBar from "../NavBar";
import CryptoRatePage from "../../CryptoRatePage.jsx";

export default function MrrPage({ onCall, onNavigateHome, nhClient = "VN", currentUser }) {
  const pathname = window.location.pathname || "/";
  const [mrrClient, setMrrClient] = useState("VN");
  const [mrrPoolData, setMrrPoolData] = useState(null);
  const [mrrPoolRigId, setMrrPoolRigId] = useState("");
  const [mrrPoolRentalId, setMrrPoolRentalId] = useState("");
  const userRole = currentUser?.role || 'user';
  // Use backend-driven permissions if available
  const userPermissions = currentUser?.permissions || [];
  const canSee = (view) => userRole === 'admin' || userPermissions.includes(view);

  const handleOpenMrrPools = useCallback(
    async (rig) => {
      if (!rig || !mrrClient) return;
      const targetClient = mrrClient === "VN" && rig.mrrClient ? rig.mrrClient : mrrClient;
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
      const result = await onCall(path, { query: { client: targetClient }, silent: true });

      if (result && result.success && result.data && rigObj.name) {
        const items = Array.isArray(result.data) ? result.data : [result.data];
        items.forEach((item) => { if (item && !item.name) item.name = rigObj.name; });
      }

      setMrrPoolData(result);
      setMrrPoolRigId(rigId);
      setMrrPoolRentalId(isRented ? rentalId : "");
    },
    [onCall, mrrClient],
  );

  return (
    <main className="miner-page">
      <NavBar currentPath={pathname} />
      <header className="miner-page-header">
        <div>
          <h1>MRR Dashboard</h1>
          <p>MiningRigRentals — rig management, active rentals, pool config, and market comparisons</p>
        </div>
        <div className="miner-header-actions">
          <TelegramManager onCall={onCall} mrrClient={mrrClient} />
          {canSee('nicehash') && <button className="btn-pro secondary" onClick={() => window.location.href = "/nicehash"}>NiceHash</button>}
          {canSee('miner') && <button className="btn-pro secondary" onClick={() => window.location.href = "/miner"}>Miner</button>}
          {canSee('mining') && <button className="btn-pro secondary" onClick={() => window.location.href = "/mining"}>Opportunities</button>}
          {canSee('dashboard') && <button className="btn-pro secondary" onClick={onNavigateHome}>
            Dashboard
          </button>}
        </div>
      </header>

      <RentedRigProvider callApi={onCall}>
        <NiceHashOrderProvider nhClient={nhClient} callApi={onCall}>
          <div className="column-stack" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <article className="panel">
              <MiningRigRental
                onCall={onCall}
                mrrClient={mrrClient}
                setMrrClient={setMrrClient}
                onOpenMrrPools={handleOpenMrrPools}
              />
            </article>

            <article className="panel" style={{ maxHeight: "800px", overflowY: "auto" }}>
              <MrrPoolsManager
                onCall={onCall}
                mrrClient={mrrClient}
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
        </NiceHashOrderProvider>
      </RentedRigProvider>
    </main>
  );
}
