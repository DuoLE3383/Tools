import MiningRigSection from "../components/mrr/MiningRigSection";
import DashboardHeader from "../components/Dashboard/DashboardHeader.jsx";
import CryptoRatePage from "../../CryptoRatePage.jsx";
import { useNiceHashOrders } from "../components/nicehash/NiceHashContext.jsx";
import { useCallback } from "react";

export default function MrrPage({
  state,
  dispatch,
  callApi,
  handleLogout,
  currentUser,
  isAdmin,
  forceCheckStatus,
  handleMiningCall,
  handleOpenMrrPools,
  setMrrClient,
  onNavigate,
}) {
  const { refresh: refreshNhOrders } = useNiceHashOrders();

  const handleRefresh = useCallback(() => {
    if (forceCheckStatus) forceCheckStatus();
    if (refreshNhOrders) refreshNhOrders();
  }, [forceCheckStatus, refreshNhOrders]);

  return (
    <div className="page-full">
      <DashboardHeader
        state={state}
        currentUser={currentUser}
        isAdmin={isAdmin}
        onForceCheck={handleRefresh}
        onDebugLogs={() => dispatch({ type: "SET_DEBUG_MODAL", payload: true })}
        onLogout={handleLogout}
        onUsers={() => dispatch({ type: "SET_USERS_MODAL", payload: true })}
        onCalculator={() => dispatch({ type: "SET_CALCULATOR_MODAL", payload: true })}
        onNavigate={onNavigate}
        currentView="mrr"
      />

      <main className="dashboard" style={{ display: "flex", gap: "24px" }}>
  <div style={{ width: "70%", flexShrink: 0 }}> {/* 2/3 */}
    <article className="panel">
      <MiningRigSection
        onCall={handleMiningCall}
        rigsData={state.output?.rigsData}
        mrrClient={state.mrrClient}
        setMrrClient={setMrrClient}
        onOpenMrrPools={handleOpenMrrPools}
        coinPrices={state.coinPrices}
      />
    </article>
  </div>
  
  <div style={{ width: "33.333%", flexShrink: 0 }}> {/* 1/3 */}
    <CryptoRatePage onCall={callApi} coinPrices={state.coinPrices} />
  </div>
</main>
    </div>
  );
}
