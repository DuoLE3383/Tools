import Pools from "./Pools";
import Modal from "./Modal";
import NiceHash from "./nicehash/NiceHash";
import MiningRigSection from "./mrr/MiningRigSection";
import { NiceHashOrderProvider } from "./nicehash/NiceHashContext.jsx";
import HashrateCalculator from "./HashrateCalculator";

export default function Dashboard({
  state,
  dispatch,
  callApi,
  handleLogout,
  forceCheckStatus,
  handleMiningCall,
  handleOpenMrrPools,
  setNhOrderClient,
  setNhPoolClient,
  setMrrClient,
}) {
  return (
    <div className="app-shell">
      {/* HEADER */}
      <header className="app-header">
        <div className="brand-block">
          <div className="status-card">
            <div className="status-item">
              <span style={{ opacity: 0.5, marginRight: '10px' }}>SYSTEM:</span>
              <span className={`status-value ${state.loading ? "status-ready" : state.error ? "status-error" : "status-success"}`}>
                {state.loading ? "Loading..." : state.error ? "Error" : "Ready"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* POOLS SECTION */}
      <section className="pools-section">
        <Pools
          onCall={callApi}
          poolData={state.poolData}
          niceHashData={state.niceHashData}
          mrrClient={state.mrrClient}
          setMrrClient={setMrrClient}
          nhClient={state.nhPoolClient}
          setNhClient={setNhPoolClient}
        />
      </section>

      {/* MAIN DASHBOARD */}
      <main className="dashboard">
        <div className="column-stack">
          <NiceHashOrderProvider
            nhClient={state.nhOrderClient}
            callApi={callApi}
          >
            {/* NICEHASH SECTION */}
            <article className="panel">
              <NiceHash
                key={state.nhOrderClient}
                onCall={handleMiningCall}
                output={state.niceHashData}
                algorithm={state.algorithm}
                market={state.market}
                nhClient={state.nhOrderClient}
                setNhClient={setNhOrderClient}
              />
            </article>

            {/* QUICK ACTIONS */}
            <div className="panel">
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Quick Actions</h3>
              <p style={{ margin: "4px 0 1rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>Unit conversions and rental projections.</p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  className="btn-pro secondary"
                  onClick={() =>
                    dispatch({ type: "SET_CALCULATOR_MODAL", payload: true })
                  }
                >
                  Unit Converter
                </button>
                <button
                  className="btn-pro secondary"
                  onClick={() => {
                    window.history.pushState({}, "", "/cryptorate");
                    dispatch({ type: "SET_VIEW", payload: "cryptorate" });
                  }}
                >
                  Live Rates
                </button>
              </div>
            </div>

            {/* MINING RIG SECTION */}
            <article className="panel">
              <MiningRigSection
                onCall={handleMiningCall}
                rigsData={state.rigsData}
                mrrClient={state.mrrClient}
                setMrrClient={setMrrClient}
                onOpenMrrPools={handleOpenMrrPools}
              />
            </article>
          </NiceHashOrderProvider>

          {/* HERO MINERS CARD */}
        </div>
      </main>

      {/* MODALS */}
      <Modal
        isOpen={state.responseModalOpen}
        onClose={() =>
          dispatch({
            type: "SET_MODAL",
            payload: { content: null, open: false },
          })
        }
        title="API Operation Result"
        maxWidth="800px"
      >
        {state.lastCall && (
          <div className="response-meta" style={{ fontFamily: 'monospace', marginBottom: '1rem', opacity: 0.7, fontSize: '0.75rem' }}>
            {state.lastCall.method} {state.lastCall.path} — {state.lastCall.status} ({state.lastCall.durationMs}ms)
          </div>
        )}
        <pre className="response-body" style={{ maxHeight: '60vh', overflow: 'auto', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
          {JSON.stringify(state.modalContent, null, 2)}
        </pre>
      </Modal>

      <Modal
        isOpen={state.debugModalOpen}
        onClose={() => dispatch({ type: "SET_DEBUG_MODAL", payload: false })}
        title="System Debug Logs"
        maxWidth="800px"
      >
        <div className="code-block-content" style={{ maxHeight: '60vh', overflow: 'auto', fontSize: '11px', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
          {state.debugLogs.length === 0 && <div style={{ opacity: 0.5 }}>No logs captured yet.</div>}
          {state.debugLogs.map((log, i) => (
            <div key={i} style={{ borderBottom: "1px solid var(--border-color)", padding: '0.25rem 0' }}>
              {log}
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        isOpen={state.calculatorModalOpen}
        onClose={() =>
          dispatch({ type: "SET_CALCULATOR_MODAL", payload: false })
        }
        title="Hashrate Calculator"
        maxWidth="600px"
      >
        <HashrateCalculator />
      </Modal>
    </div>
  );
}
