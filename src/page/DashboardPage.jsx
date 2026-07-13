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
