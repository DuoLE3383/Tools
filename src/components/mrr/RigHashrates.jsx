import { formatHashrateWithUnit } from "./formatters";

export const RigHashrates = ({
  info,
  cur,
  avgVal,
  adsVal,
  targetHashrate,
  isBehind,
  hSuffix,
  rig,
}) => {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "4px",
        marginTop: "4px",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: "6px",
          padding: "4px 6px",
        }}
      >
        <div
          style={{
            opacity: 0.55,
            textTransform: "uppercase",
            fontSize: "7px",
          }}
        >
          Current
        </div>
        <div
          style={{
            color: "#e2e8f0",
            fontWeight: 700,
            fontSize: "10px",
          }}
        >
          {info?.current ||
            (cur > 0
              ? formatHashrateWithUnit(
                  cur,
                  rig.hashrate?.suffix ||
                    rig.hashrate?.current?.type ||
                    "H",
                )
              : "0 H/s")}
        </div>
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: "6px",
          padding: "4px 6px",
        }}
      >
        <div
          style={{
            opacity: 0.55,
            textTransform: "uppercase",
            fontSize: "7px",
          }}
        >
          Average
        </div>
        <div
          style={{
            color: "#e2e8f0",
            fontWeight: 700,
            fontSize: "10px",
          }}
        >
          {info?.average ||
            (avgVal > 0
              ? formatHashrateWithUnit(
                  avgVal,
                  rig.hashrate?.suffix ||
                    rig.hashrate?.average?.type ||
                    "H",
                )
              : "0 N/A")}
        </div>
      </div>
      <div
        style={{
          background: "rgba(63, 82, 255, 0.34)",
          borderRadius: "6px",
          padding: "4px 6px",
        }}
      >
        <div
          style={{
            opacity: 0.55,
            textTransform: "uppercase",
            fontSize: "7px",
          }}
        >
          Advertised
        </div>
        <div
          style={{
            color: "#ffca1d",
            fontWeight: 700,
            fontSize: "11px",
          }}
        >
          {info?.advertised ||
            (adsVal > 0
              ? formatHashrateWithUnit(
                  adsVal,
                  rig.hashrate?.suffix ||
                    rig.hashrate?.advertised?.type ||
                    "H",
                )
              : "0 N/A")}
        </div>
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: "6px",
          padding: "4px 6px",
        }}
      >
        <div
          style={{
            opacity: 0.55,
            textTransform: "uppercase",
            fontSize: "7px",
          }}
        >
          Target
        </div>
        <div
          style={{
            color: isBehind ? "#f87171" : "#34d399",
            fontWeight: 700,
            fontSize: "10px",
          }}
        >
          {Math.max(0, targetHashrate).toFixed(2)}{" "}
          <small style={{ opacity: 0.5, fontSize: "8px" }}>
            {String(hSuffix).toUpperCase()}
          </small>
        </div>
      </div>
    </div>
  );
};