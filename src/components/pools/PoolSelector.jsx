// components/pools/PoolSelector.jsx
import React from "react";
import Modal from "../Modal";
import { poolHelpers as ph, sanitizeNhClientTag } from "../../core/poolUtils";
import { getAlgoDisplayName } from "../../core/poolUtils";

export function PoolSelector({
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
      title="Select a Stratum Pool"
      maxWidth="600px"
    >
      <div
        className="select-dropdown-pro"
        style={{
          position: "static",
          boxShadow: "none",
          border: "none",
          padding: 0,
        }}
      >
        {pools.map((pool, index) => {
          const key = ph.getKey(pool, index);
          const label = ph.getLabel(pool, index);
          const isActive = selectedId === key;
          return (
            <div
              key={key}
              className={`dropdown-item-pro ${isActive ? "active" : ""}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
              onClick={() => onSelect(pool, key)}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <strong style={{ color: isActive ? "#3b82f6" : "inherit" }}>
                  {label}
                </strong>
                <code style={{ fontSize: "11px", opacity: 0.7 }}>
                  {getAlgoDisplayName(ph.getAlgo(pool))}
                </code>
                {(pool.client || pool.nhClient) && (
                  <span
                    style={{
                      fontSize: "9px",
                      color: "#10b981",
                      marginTop: "2px",
                    }}
                  >
                    Account: {sanitizeNhClientTag(pool.client || pool.nhClient, nhClient)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}