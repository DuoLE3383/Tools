import { useCallback, useEffect, useMemo, useState } from "react";

const formatHashrate = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "0 H/s";
  const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s"];
  let next = num;
  let index = 0;
  while (next >= 1000 && index < units.length - 1) {
    next /= 1000;
    index += 1;
  }
  return `${next.toFixed(next >= 100 ? 0 : next >= 10 ? 1 : 2)} ${units[index]}`;
};

const formatNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(num);
};

const formatBtc = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "N/A";
  return `${num.toFixed(8)} BTC`;
};

const formatTime = (value) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
};

function StatTile({ label, value }) {
  return (
    <div className="miner-stat-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MinerAccountCard({ account }) {
  const workers = Array.isArray(account.workers) ? account.workers : [];
  const onlineWorkers = workers.filter((worker) => worker.online !== false);
  const market = account.market || {};

  return (
    <article className="panel miner-account-card">
      <div className="panel-header miner-card-header">
        <div>
          <h2>{account.coin}</h2>
          <p className="miner-muted">{account.pool}</p>
        </div>
        <span className={`miner-status ${account.success ? "ok" : "error"}`}>
          {account.success ? "Online" : "Error"}
        </span>
      </div>

      <div className="miner-address">{account.address}</div>

      {account.error ? (
        <div className="miner-error">{account.error}</div>
      ) : (
        <>
          <div className="miner-stats-grid">
            <StatTile label="Current" value={formatHashrate(account.currentHashrate)} />
            <StatTile label="Average" value={formatHashrate(account.averageHashrate)} />
            <StatTile label="Workers" value={`${onlineWorkers.length}/${workers.length}`} />
            <StatTile label="Balance" value={formatNumber(account.balance)} />
            <StatTile label="Paid" value={formatNumber(account.paid)} />
            <StatTile label="Immature" value={formatNumber(account.immature)} />
          </div>

          <div className="miner-market-panel">
            <div className="miner-section-title">Market price</div>
            <div className="miner-market-heading">
              <strong>{market.label || market.algorithm || "Unknown algorithm"}</strong>
              {market.unit && <span>BTC/{market.unit}/Day</span>}
            </div>
            <div className="miner-market-grid">
              <StatTile label="NiceHash" value={formatBtc(market.nicehash?.price)} />
              <StatTile label="MRR" value={formatBtc(market.mrr?.price)} />
              <StatTile
                label="Cheapest"
                value={
                  market.cheapest
                    ? `${market.cheapest.source} ${formatBtc(market.cheapest.price)}`
                    : "N/A"
                }
              />
            </div>
            <div
              className={`miner-profit-note ${
                market.cheapest ? "ok" : "muted"
              }`}
            >
              {market.profitable || market.error || "Market comparison unavailable"}
            </div>
            {(market.nicehash?.error || market.mrr?.error) && (
              <div className="miner-market-errors">
                {market.nicehash?.error && <span>NH: {market.nicehash.error}</span>}
                {market.mrr?.error && <span>MRR: {market.mrr.error}</span>}
              </div>
            )}
          </div>

          {workers.length > 0 && (
            <div className="miner-workers">
              <div className="miner-section-title">Workers</div>
              <div className="miner-worker-list">
                {workers.map((worker) => (
                  <div className="miner-worker-row" key={worker.name}>
                    <span>{worker.name}</span>
                    <strong>{formatHashrate(worker.hashrate)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="miner-card-footer">
        <span>{account.sourceUrl}</span>
        <time>{formatTime(account.fetchedAt)}</time>
      </div>
    </article>
  );
}

export default function MinerPage({ onCall, onNavigateHome }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await onCall("/api/v2/miner/accounts", { silent: true });
      if (result?.success && Array.isArray(result.accounts)) {
        setAccounts(result.accounts);
      } else {
        setError(result?.error || "Failed to load miner accounts.");
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [onCall]);

  useEffect(() => {
    loadAccounts();
    const interval = setInterval(loadAccounts, 60000);
    return () => clearInterval(interval);
  }, [loadAccounts]);

  const summary = useMemo(() => {
    const online = accounts.filter((account) => account.success).length;
    const workers = accounts.reduce(
      (total, account) => total + (Array.isArray(account.workers) ? account.workers.length : 0),
      0,
    );
    const hashrate = accounts.reduce(
      (total, account) => total + (Number(account.currentHashrate) || 0),
      0,
    );
    return { online, workers, hashrate };
  }, [accounts]);

  return (
    <main className="miner-page">
      <header className="miner-page-header">
        <div>
          <h1>Miner Accounts</h1>
          <p>HeroMiners, 2Miners, K1Pool, and Kryptex wallet monitor with NiceHash and MRR market prices</p>
        </div>
        <div className="miner-header-actions">
          <button className="btn-pro secondary" onClick={onNavigateHome}>
            Dashboard
          </button>
          <button className="btn-pro primary" onClick={loadAccounts} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <section className="miner-summary">
        <StatTile label="Accounts online" value={`${summary.online}/${accounts.length}`} />
        <StatTile label="Workers" value={summary.workers} />
        <StatTile label="Total hashrate" value={formatHashrate(summary.hashrate)} />
      </section>

      {error && <div className="miner-error">{error}</div>}

      <section className="miner-account-grid">
        {accounts.map((account) => (
          <MinerAccountCard
            key={`${account.pool}-${account.coin}-${account.address}`}
            account={account}
          />
        ))}
      </section>

      {!loading && accounts.length === 0 && !error && (
        <article className="panel miner-empty">
          No miner addresses configured.
        </article>
      )}
    </main>
  );
}
