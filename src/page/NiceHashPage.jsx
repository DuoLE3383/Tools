import NiceHash from "../components/nicehash/NiceHash";
import DashboardHeader from "../components/Dashboard/DashboardHeader.jsx";

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
  onNavigate,
}) {
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
        onNavigate={onNavigate}
        currentView="nicehash"
      />

      <main className="dashboard">
        <div className="column-stack" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
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
