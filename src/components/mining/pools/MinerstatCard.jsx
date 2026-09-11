// MinerstatCard.jsx - Pool lookup card for Minerstat
import MiningPoolCard from "./MiningPoolCard";
import { useMiningWorkspace } from "../MiningWorkspaceProvider";
import { normalizeMinerstatRows } from "../miningWorkspaceData";
import { ActivityIcon } from "../Icons.jsx";

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
      icon={<ActivityIcon size={15} color="#f472b6" />}
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
