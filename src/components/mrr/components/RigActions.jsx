import React from 'react';

const RigActions = ({
  rig,
  info,
  isMine,
  isRented,
  statusStr,
  expandedPools,
  loadingInfoIds,
  onTogglePool,
  onOpenPool,
  onOpenCompletionCalculator,
  onFetchDetail,
  onHandleStatus,
  onHandlePrice,
  onReload,
  setEnrichedInfo
}) => {
  const isLoading = loadingInfoIds.has(rig.id);

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
            onTogglePool(rig.id);
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
              onHandleStatus(
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
            onClick={() => onHandlePrice(rig)}
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
        onClick={() => onFetchDetail(rig)}
        disabled={isLoading}
      >
        {isLoading ? "..." : "More"}
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
          onReload(rig);
        }}
        disabled={isLoading}
        title="Reload Rig Details"
      >
        {isLoading ? "..." : "↻"}
      </button>
    </div>
  );
};

export default React.memo(RigActions);