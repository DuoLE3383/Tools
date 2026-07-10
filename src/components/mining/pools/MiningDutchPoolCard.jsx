// MiningDutchPoolCard.jsx - Pool lookup card for Mining-Dutch
import MiningPoolCard from "./MiningPoolCard";
import { useMiningWorkspace } from "../MiningWorkspaceProvider";
import { normalizeMiningDutchRows } from "../miningWorkspaceData";

export default function MiningDutchPoolCard() {
  const {
    dutchStats,
    dutchLoading,
    dutchError,
    refresh,
  } = useMiningWorkspace();

  const rows = normalizeMiningDutchRows(dutchStats);

  return (
    <MiningPoolCard
      title="Mining-Dutch"
      icon="🇳🇱"
      accent="#fbbf24"
      rows={rows}
      loading={dutchLoading}
      error={dutchError}
      lastUpdated={dutchStats?.fetchedAt}
      onRefresh={() => refresh(true)}
      filterKey="btcPerDay"
    />
  );
}
