// pages/NiceHashPage.jsx - Remove duplicate NiceHashOrderProvider
import NiceHash from "../components/nicehash/NiceHash";
import DashboardHeader from "../components/Dashboard/DashboardHeader.jsx";
import { useCallback } from "react";

export default function NiceHashPage({
  state,
  dispatch,
  callApi,
  handleLogout,
  currentUser,
  isAdmin,
  forceCheckStatus,
  handleMiningCall,
  setNhOrderClient,
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
    <div className="app-shell" style={{ padding: "0 20px 40px", maxWidth: "1600px", margin: "0 auto" }}>
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
        currentView="nicehash"
      />

      <main className="dashboard">
        <div className="column-stack" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* ✅ Remove NiceHashOrderProvider - it's now at the app level */}
          <article className="panel">
            <NiceHash
              key={state.nhOrderClient}
              onCall={handleMiningCall}
              output={state.output}
              algorithm={state.algorithm}
              market={state.market}
              nhClient={state.nhOrderClient}
              setNhClient={setNhOrderClient}
            />
          </article>
        </div>
      </main>
    </div>
  );
}