import { useCallback, useEffect, useRef, useState } from "react";
import { GlobeIcon, TrashIcon, AlertIcon, TrendingUpIcon } from "../Icons.jsx";
import MiningPanel, { PanelActions, StatTile, StatGrid } from "../MiningPanel.jsx";

const DEFAULT_ACCOUNTS = [
  {
    id: "2miners-zeph",
    provider: "2Miners",
    label: "Zephyr SOLO",
    coin: "ZEPH",
    url: "https://solo-zeph.2miners.com/account/ZEPHs86UQoeNKQ9kvUmNsw3KwZBGfurtmRpqtXCs7gM4gJgNC8PGQEmJEvgUWNHCqcfyvXKpzfUQaJuFGMVyE7EzNKbonkReRpn",
  },
  {
    id: "miningmadness-ppc",
    provider: "MiningMadness",
    label: "MiningMadness PPC",
    coin: "PPC",
    address: "PVkg52aTyzadkV8WMBL9TCATayKzMdEpgV",
  },
];

const STORAGE_KEY = "external_pool_monitor_accounts";

function loadAccounts() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored : DEFAULT_ACCOUNTS;
  } catch { return DEFAULT_ACCOUNTS; }
}

function saveAccounts(accounts) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts)); } catch {}
}

function shortAddress(value) {
  const text = String(value || "");
  return text.length > 22 ? `${text.slice(0, 12)}...${text.slice(-6)}` : text;
}

function ProjectionTable({ data }) {
  const daily = Number(data?.paid24h || 0);
  const coinPrice = Number(data?.coinPrice || 0);
  const btcPrice = Number(data?.btcPrice || 0);
  if (daily <= 0) return null;

  const rows = [
    ["Hourly", daily / 24],
    ["Daily", daily],
    ["Weekly", daily * 7],
    ["Monthly", daily * 30],
  ];
  const formatCoin = (value) => value >= 1000 ? value.toFixed(1) : value >= 1 ? value.toFixed(4) : value.toFixed(6);
  const formatUsd = (value) => coinPrice > 0 ? `$${(value * coinPrice).toFixed(2)}` : "N/A";
  const formatBtc = (value) => coinPrice > 0 && btcPrice > 0 ? `${(value * coinPrice / btcPrice).toFixed(6)} BTC` : "N/A";

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.2)",
        borderRadius: "8px",
        padding: "8px 10px",
        fontSize: "11px",
        border: "1px solid rgba(148,163,184,0.08)",
        marginTop: "6px",
      }}
    >
      <div
        style={{
          color: "#94a3b8",
          marginBottom: "6px",
          fontWeight: 700,
          fontSize: "9px",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          display: "flex",
          alignItems: "center",
          gap: "5px",
        }}
      >
        <TrendingUpIcon size={12} /> Mining Projections
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "#64748b", borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
            <th style={{ padding: "2px 4px", textAlign: "left" }}></th>
            <th style={{ padding: "2px 4px", textAlign: "right" }}>{data.coin}</th>
            <th style={{ padding: "2px 4px", textAlign: "right" }}>USD</th>
            <th style={{ padding: "2px 4px", textAlign: "right" }}>BTC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} style={{ borderBottom: "1px solid rgba(148,163,184,0.04)" }}>
              <td style={{ padding: "2px 4px", color: "#94a3b8", fontWeight: 700 }}>{label}</td>
              <td style={{ padding: "2px 4px", textAlign: "right", color: "#e2e8f0", fontFamily: "monospace" }}>{formatCoin(value)}</td>
              <td style={{ padding: "2px 4px", textAlign: "right", color: coinPrice > 0 ? "#fbbf24" : "#64748b", fontFamily: "monospace" }}>{formatUsd(value)}</td>
              <td style={{ padding: "2px 4px", textAlign: "right", color: "#34d399", fontFamily: "monospace", fontWeight: 700 }}>{formatBtc(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: "9px", color: "#64748b", marginTop: "4px", fontStyle: "italic" }}>
        Based on 24h paid average
      </div>
    </div>
  );
}

export default function ExternalPoolMonitor({ onCall }) {
  const [accounts, setAccounts] = useState(loadAccounts);
  const [results, setResults] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [provider, setProvider] = useState("2Miners");
  const [value, setValue] = useState("");
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = {};
    const nextErrors = {};
    try {
      await Promise.all(accounts.map(async (account) => {
        const query = account.provider === "2Miners" ? { url: account.url } : { address: account.address };
        try {
          const result = await onCall(`/api/v2/mining-stats/${account.provider === "2Miners" ? "2miners" : "miningmadness"}`, { query, silent: true });
          if (result?.success) next[account.id] = result.data;
          else nextErrors[account.id] = result?.error || "Failed to fetch";
        } catch (err) {
          nextErrors[account.id] = err.message;
        }
      }));
      setResults(next);
      setErrors(nextErrors);
    } finally { setLoading(false); }
  }, [accounts, onCall]);

  useEffect(() => {
    refresh();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    timerRef.current = setInterval(refresh, 30000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, refresh]);

  const addAccount = () => {
    const input = value.trim();
    if (!input) return;
    const account = provider === "2Miners"
      ? { id: `2miners:${input}`, provider, label: "2Miners", coin: "ZEPH", url: input }
      : { id: `miningmadness:${input}`, provider: "MiningMadness", label: "MiningMadness", coin: "PPC", address: input };
    if (accounts.some((item) => item.id === account.id)) return;
    const next = [...accounts, account];
    setAccounts(next);
    saveAccounts(next);
    setValue("");
  };

  const removeAccount = (id) => {
    const next = accounts.filter((account) => account.id !== id);
    setAccounts(next);
    saveAccounts(next);
    setResults((current) => { const copy = { ...current }; delete copy[id]; return copy; });
  };

  const clearAccounts = () => {
    setAccounts([]);
    saveAccounts([]);
    setResults({});
    setErrors({});
  };

  return (
    <MiningPanel
      icon={<GlobeIcon size={16} color="#38bdf8" />}
      accent="#38bdf8"
      title="External"
      subtitle={`${accounts.length} account${accounts.length !== 1 ? "s" : ""}${autoRefresh ? " · Auto 30s" : " · Manual"}`}
      actions={
        <PanelActions
          autoRefresh={autoRefresh}
          onToggleAuto={() => setAutoRefresh((v) => !v)}
          onRefresh={refresh}
          loading={loading}
          onClear={clearAccounts}
        />
      }
    >
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
          style={{
            padding: "8px 10px",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)",
            borderRadius: "8px",
            color: "#e2e8f0",
            fontSize: "12px",
          }}
        >
          <option>2Miners</option>
          <option>MiningMadness</option>
        </select>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") addAccount(); }}
          placeholder={provider === "2Miners" ? "2Miners account URL" : "MiningMadness wallet address"}
          style={{
            flex: 1,
            minWidth: 180,
            padding: "8px 10px",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)",
            borderRadius: "8px",
            color: "#e2e8f0",
            fontSize: "12px",
          }}
        />
        <button className="btn-pro primary" onClick={addAccount} disabled={!value.trim()} style={{ padding: "8px 14px", fontSize: "12px" }}>
          + Add
        </button>
      </div>

      {accounts.map((account) => {
        const data = results[account.id];
        return (
          <div
            key={account.id}
            style={{
              padding: "10px",
              background: "rgba(0,0,0,0.2)",
              borderRadius: "8px",
              border: "1px solid rgba(148,163,184,0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ color: "#e2e8f0" }}>
                  {account.provider === "2Miners" ? "ZEPH" : account.coin || data?.coin || account.label}
                </strong>
                <div style={{ color: "#64748b", fontSize: "11px" }}>
                  {account.provider} · {shortAddress(account.address || account.url)}
                </div>
              </div>
              <button
                onClick={() => removeAccount(account.id)}
                style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", padding: "2px", display: "flex" }}
                title="Remove"
                aria-label="Remove"
              >
                <TrashIcon size={14} />
              </button>
            </div>

            {errors[account.id] && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#f87171", fontSize: "11px", marginTop: "6px" }}>
                <AlertIcon size={13} /> {errors[account.id]}
              </div>
            )}
            {loading && !data && !errors[account.id] && (
              <div style={{ color: "#fbbf24", fontSize: "11px", marginTop: "6px" }}>Loading...</div>
            )}
            {data && (
              <>
                <StatGrid cols={2}>
                  <StatTile label="Hashrate" value={data.hashrate || "0 H/s"} color="#38bdf8" />
                  <StatTile label="Workers" value={data.workersOnline ?? 0} />
                  <StatTile label="Pending" value={data.pendingBalance ?? "N/A"} color="#f59e0b" />
                  <StatTile label="Paid (24h)" value={data.paid24h ?? "N/A"} color="#34d399" />
                </StatGrid>
                <ProjectionTable data={data} />
              </>
            )}
          </div>
        );
      })}

      {!accounts.length && (
        <div style={{ color: "#64748b", fontSize: "12px", textAlign: "center", padding: "12px" }}>
          Add a pool account to monitor.
        </div>
      )}
    </MiningPanel>
  );
}
