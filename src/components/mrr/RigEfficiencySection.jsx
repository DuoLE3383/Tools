import { CountdownTimer } from "./MiningRigRental";
import { RigHashrates } from "./RigHashrates.jsx";

export const RigEfficiencySection = ({
  effNum,
  eff,
  timeProgress,
  info,
  rig,
  getRoiColor,
  cur,
  avgVal,
  adsVal,
  targetHashrate,
  isBehind,
  hSuffix,
}) => {
  return (
    <section
      style={{
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "8px",
        padding: "2px",
      }}
    >
      <div style={{ display: "grid", gap: "4px" }}>
        {/* Efficiency Bar */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "8px",
              marginBottom: "2px",
            }}
          >
            <span style={{ opacity: 0.55, textTransform: "uppercase" }}>
              Efficiency
            </span>
            <span
              style={{
                fontSize: "20px",
                fontWeight: 800,
                color:
                  effNum >= 100
                    ? "#f832ffde"
                    : effNum > 90
                      ? "#00ff37"
                      : effNum > 50
                        ? "#ffb700"
                        : "#ef4444",
              }}
            >
              {eff}%
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "4px",
              background: "rgba(255,255,255,0.08)",
              borderRadius: "999px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, effNum || 0))}%`,
                height: "100%",
                background: getRoiColor(effNum),
                borderRadius: "999px",
              }}
            />
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "8px",
              marginBottom: "2px",
            }}
          >
            <span style={{ opacity: 0.55, textTransform: "uppercase" }}>
              Progress
            </span>
            <span
              style={{
                fontSize: "16px",
                fontWeight: 800,
                color: timeProgress > 90 ? "#f87171" : "#8b5cf6",
              }}
            >
              {timeProgress.toFixed(2)}%
            </span>
          </div>
          <span
            style={{
              alignItems: "flex-end",
              marginTop: "5px",
              display: "flex",
              justifyContent: "end",
              fontSize: "10px",
              color: "#94a3b8",
              padding: "3px 0",
            }}
          >
            <CountdownTimer endTime={info?.endTime || rig.end} />
          </span>

          <div
            style={{
              width: "100%",
              height: "4px",
              background: "rgba(255,255,255,0.08)",
              borderRadius: "999px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, timeProgress || 0))}%`,
                height: "100%",
                background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
                borderRadius: "999px",
              }}
            />
          </div>
        </div>

        {/* Hashrates Grid */}
        <RigHashrates
          info={info}
          cur={cur}
          avgVal={avgVal}
          adsVal={adsVal}
          targetHashrate={targetHashrate}
          isBehind={isBehind}
          hSuffix={hSuffix}
          rig={rig}
        />
      </div>
    </section>
  );
};