// components/pools/PoolInventory.jsx
import React from "react";
import Modal from "../Modal";
import { poolHelpers as ph, sanitizeNhClientTag } from "../../core/poolUtils";
import { getAlgoDisplayName } from "../../core/poolUtils";

export function PoolInventory({
  isOpen,
  onClose,
  pools,
  onSelect,
  nhClient,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pool Inventory"
      maxWidth="1200px"
    >
      <div style={{ maxHeight: "75vh", overflowY: "auto", padding: "10px" }}>
        <table className="pro-table">
          <thead>
            <tr style={{ fontSize: "11px", opacity: 0.6 }}>
              <th>NAME</th>
              <th>ALGORITHM</th>
              <th>STRATUM HOST</th>
              <th>PORT</th>
              <th>USERNAME</th>
              <th>ACCOUNT</th>
              <th style={{ textAlign: "right" }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((pool, idx) => {
              const key = ph.getKey(pool, idx);
              const label = ph.getLabel(pool, idx);
              const algo = ph.getAlgo(pool);
              return (
                <tr
                  key={key}
                  style={{
                    fontSize: "11px",
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                  }}
                >
                  <td style={{ fontWeight: "bold", color: "#f8fafc" }}>
                    {label}
                  </td>
                  <td style={{ color: "#60a5fa" }}>
                    {getAlgoDisplayName(algo)}
                  </td>
                  <td style={{ fontFamily: "monospace", opacity: 0.8 }}>
                    {pool.stratumHost || pool.stratumHostname || pool.host || "N/A"}
                  </td>
                  <td style={{ fontFamily: "monospace" }}>
                    {pool.stratumPort || pool.port || "N/A"}
                  </td>
                  <td style={{ fontFamily: "monospace", opacity: 0.8 }}>
                    {pool.username || pool.user || "N/A"}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: "9px",
                        background: "rgba(255,255,255,0.05)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {sanitizeNhClientTag(pool.client || pool.nhClient || nhClient, nhClient)}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="btn-pro secondary"
                      style={{ color: "#10b981" }}
                      onClick={() => {
                        onSelect(pool, key);
                        onClose();
                      }}
                    >
                      Select
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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