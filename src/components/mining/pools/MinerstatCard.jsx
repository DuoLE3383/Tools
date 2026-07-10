// MinerstatCard.jsx - Pool lookup card for Minerstat
import MiningPoolCard from "./MiningPoolCard";
import { useMiningWorkspace } from "../MiningWorkspaceProvider";
import { normalizeMinerstatRows } from "../miningWorkspaceData";

export default function MinerstatCard() {
  const {
    minerstatStats,
    minerstatLoading,
    minerstatError,
    refresh,
  } = useMiningWorkspace();

  const rows = normalizeMinerstatRows(minerstatStats);

  return (
    <MiningPoolCard
      title="Minerstat"
      icon="📊"
      accent="#f472b6"
      rows={rows}
      loading={minerstatLoading}
      error={minerstatError}
      lastUpdated={minerstatStats?.fetchedAt}
      onRefresh={() => refresh(true)}
      filterKey="btcPerDay"
    />
  );
}
