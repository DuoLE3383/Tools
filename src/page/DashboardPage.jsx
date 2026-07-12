import { useCallback } from "react";
import Pools from "../components/pools/Pools";
import DashboardHeader from "../components/Dashboard/DashboardHeader.jsx";
import QuickActions from "./QuickActions";
import Modal from "../components/Modal";
import HashrateCalculator from "../components/HashrateCalculator";
import { UserManagement } from "../components/Admin/UserManagement";

export default function DashboardPage({
  state,
  dispatch,
  callApi,
  handleLogout,
  currentUser,
  isAdmin,
  forceCheckStatus,
  setNhPoolClient,
  setMrrClient,
}) {
  const handleNavClick = useCallback((path) => (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
      let view = 'dashboard';
      if (path === '/cryptorate') view = 'cryptorate';
      else if (path === '/mining') view = 'mining';
      else if (path === '/nicehash') view = 'nicehash';
      else if (path === '/mrr') view = 'mrr';
      dispatch({ type: "SET_VIEW", payload: view });
    }, [dispatch]);

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
        currentView="dashboard"
      />

      {/* POOLS SECTION — MAIN CONTENT */}
      <section className="dashboard-pools-section">
        <Pools
          onCall={callApi}
          poolData={state.output?.poolData}
          niceHashData={state.output}
          mrrClient={state.mrrClient}
          setMrrClient={setMrrClient}
          nhClient={state.nhPoolClient}
          setNhClient={setNhPoolClient}
        />
      </section>

      {/* MODALS */}
      <UserManagement
        isOpen={state.usersModalOpen}
        onClose={() => dispatch({ type: "SET_USERS_MODAL", payload: false })}
        callApi={callApi}
      />

      <Modal
        isOpen={state.calculatorModalOpen}
        onClose={() => dispatch({ type: "SET_CALCULATOR_MODAL", payload: false })}
        title="Hashrate Calculator"
        maxWidth="600px"
      >
        <HashrateCalculator />
      </Modal>
    </div>
  );
}
