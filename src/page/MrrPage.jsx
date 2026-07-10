import MiningRigSection from "../components/mrr/MiningRigSection";
import DashboardHeader from "../components/Dashboard/DashboardHeader.jsx";
import { useCallback } from "react";
import CryptoRatePage from "../../CryptoRatePage.jsx";

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
}) {
  const handleNavClick = useCallback((path) => (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
      const view = path.startsWith('/') ? path.substring(1) : path;
      dispatch({ type: "SET_VIEW", payload: view || "dashboard" });
    },
    [dispatch],
  );

  return (
    <div className="page-full">
      <DashboardHeader
        state={state}
        currentUser={currentUser}
        isAdmin={isAdmin}
        onForceCheck={forceCheckStatus}
        onDebugLogs={() => dispatch({ type: "SET_DEBUG_MODAL", payload: true })}
        onLogout={handleLogout}
        onUsers={() => dispatch({ type: "SET_USERS_MODAL", payload: true })}
        onCalculator={() => dispatch({ type: "SET_CALCULATOR_MODAL", payload: true })}
        onNavigate={handleNavClick}
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
