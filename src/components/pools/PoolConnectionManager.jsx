// components/pools/PoolConnectionManager.jsx
import React from "react";
import Modal from "../Modal";
import { poolHelpers as ph, sanitizeNhClientTag } from "../../core/poolUtils";
import { getAlgoDisplayName } from "../../core/poolUtils";

export function PoolConnectionManager({
  isOpen,
  onClose,
  pools,
  selectedId,
  onSelect,
  nhClient,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pool Connection Manager"
      maxWidth="1000px"
    >
      <div style={{ padding: "10px" }}>
        <div
          className="pool-list"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            maxHeight: "70vh",
            overflowY: "auto",
            paddingRight: "5px",
          }}
        >
          {pools.map((pool, idx) => {
            const key = ph.getKey(pool, idx);
            const label = ph.getLabel(pool, idx);
            const algo = ph.getAlgo(pool);
            const isSelected = selectedId === key;

            return (
              <div
                key={key}
                className="pool-item"
                style={{
                  display: "grid",
                  gridTemplateColumns: "45px 1.2fr 1.5fr 1fr 80px",
                  gap: "15px",
                  alignItems: "center",
                  fontSize: "11px",
                  background: isSelected
                    ? "rgba(59, 130, 246, 0.08)"
                    : "rgba(255,255,255,0.02)",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: isSelected
                    ? "1px solid rgba(59, 130, 246, 0.4)"
                    : "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div
                  style={{
                    fontWeight: "bold",
                    textAlign: "center",
                    opacity: 0.5,
                  }}
                >
                  #{idx + 1}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontWeight: "600",
                      color: isSelected ? "#60a5fa" : "#f8fafc",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: "9px",
                      textTransform: "uppercase",
                      color: "#60a5fa",
                      opacity: 0.8,
                    }}
                  >
                    {getAlgoDisplayName(algo)}
                  </div>
                </div>
                <div
                  style={{
                    opacity: 0.7,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    fontSize: "10px",
                  }}
                >
                  <span style={{ opacity: 0.4 }}>host:</span>{" "}
                  {pool.stratumHost || pool.stratumHostname || pool.host}:
                  {pool.stratumPort || pool.port}
                </div>
                <div
                  style={{
                    opacity: 0.7,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    fontSize: "10px",
                  }}
                >
                  <span style={{ opacity: 0.4 }}>user:</span>{" "}
                  {pool.username || pool.user}
                </div>
                <div style={{ textAlign: "right" }}>
                  <button
                    className="btn-pro secondary"
                    style={{
                      fontSize: "10px",
                      padding: "4px 8px",
                      borderColor: isSelected ? "#34d399" : "",
                    }}
                    onClick={() => onSelect(pool, key)}
                  >
                    {isSelected ? "Selected" : "Select"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {pools.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px", opacity: 0.5 }}>
            No pools found.
          </div>
        )}
      </div>
      <div
        className="modal-actions"
        style={{ justifyContent: "flex-end", marginTop: "15px" }}
      >
        <button className="btn-pro secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}