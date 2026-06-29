// components/pools/ErrorModal.jsx
import React from "react";
import Modal from "../Modal";
import { getAlgoDisplayName } from "../../core/poolUtils";

export function ErrorModal({ isOpen, onClose, errors }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Failed Pool Verifications"
      maxWidth="900px"
    >
      <div style={{ maxHeight: "70vh", overflowY: "auto", padding: "5px" }}>
        {errors.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", opacity: 0.5 }}>
            No errors to show.
          </div>
        ) : (
          <table
            className="pro-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
            }}
          >
            <thead>
              <tr
                style={{
                  opacity: 0.6,
                  fontSize: "11px",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <th style={{ padding: "12px 10px" }}>Pool Name</th>
                <th style={{ padding: "12px 10px" }}>Algorithm</th>
                <th style={{ padding: "12px 10px" }}>Error Message</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((item, idx) => {
                const algo = item.algorithm || item.result?.poolDetails?.miningAlgorithm || "Unknown";
                return (
                  <tr
                    key={item.key || idx}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      fontSize: "11px",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px",
                        fontWeight: "bold",
                        color: "#f8fafc",
                      }}
                    >
                      {item.label}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        color: "#60a5fa",
                        fontFamily: "monospace",
                      }}
                    >
                      {getAlgoDisplayName(algo)}
                    </td>
                    <td style={{ padding: "10px", color: "#f87171" }}>
                      {item.result?.data?.message || item.result?.data?.error || "Unknown error"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div
        className="modal-actions"
        style={{ marginTop: "20px", justifyContent: "flex-end" }}
      >
        <button className="btn-pro secondary" onClick={onClose}>
          Close Summary
        </button>
      </div>
    </Modal>
  );
}