export const RigActions = ({
  isMine,
  isRented,
  statusStr,
  rig,
  info,
  expandedPools,
  togglePoolInfo,
  onOpenPool,
  handleRigStatus,
  handlePriceChange,
  onOpenCompletionCalculator,
  fetchRigDetailInfo,
  loadingInfoIds,
  setEnrichedInfo,
}) => {
  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        marginTop: "auto",
        flexWrap: "wrap",
      }}
    >
      {(isMine || isRented) && (
        <button
          className="btn-pro secondary"
          style={{
            flex: "1 1 120px",
            fontSize: "10px",
            background: isRented
              ? "rgba(139, 92, 246, 0.16)"
              : "rgba(255,255,255,0.05)",
            color: isRented ? "#a78bfa" : "#94a3b8",
          }}
          onClick={() => {
            togglePoolInfo(rig.id);
            onOpenPool?.(rig, info);
          }}
        >
          {expandedPools.has(rig.id) ? "Hide Pools" : "Pools"}
        </button>
      )}
      {isMine && !isRented && (
        <>
          <button
            className="btn-pro secondary"
            style={{
              flex: "1 1 90px",
              fontSize: "10px",
              color: statusStr === "disabled" ? "#10b981" : "#f87171",
            }}
            onClick={() =>
              handleRigStatus(
                rig,
                statusStr === "disabled" ? "available" : "disabled",
              )
            }
          >
            {statusStr === "disabled" ? "Enable" : "Disable"}
          </button>
          <button
            className="btn-pro secondary"
            style={{ flex: "1 1 90px", fontSize: "10px" }}
            onClick={() => handlePriceChange(rig)}
          >
            Price
          </button>
        </>
      )}
      {isRented && info && onOpenCompletionCalculator && (
        <button
          className="btn-pro secondary"
          style={{ flex: "1 1 90px", fontSize: "10px" }}
          onClick={() => onOpenCompletionCalculator(rig, info)}
        >
          Calc
        </button>
      )}
      <button
        className="btn-pro"
        style={{ flex: "1 1 90px", fontSize: "10px" }}
        onClick={() => fetchRigDetailInfo(rig)}
        disabled={loadingInfoIds.has(rig.id)}
      >
        {loadingInfoIds.has(rig.id) ? "..." : "More"}
      </button>
      <button
        className="btn-pro secondary"
        style={{
          width: "36px",
          fontSize: "12px",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onClick={() => {
          setEnrichedInfo((prev) => {
            const next = { ...prev };
            delete next[rig.id];
            return next;
          });
          fetchRigDetailInfo(rig);
        }}
        disabled={loadingInfoIds.has(rig.id)}
        title="Reload Rig Details"
      >
        {loadingInfoIds.has(rig.id) ? "..." : "↻"}
      </button>
    </div>
  );
};