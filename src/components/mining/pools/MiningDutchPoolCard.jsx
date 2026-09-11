// MiningDutchPoolCard.jsx - Pool lookup card for Mining-Dutch
import MiningPoolCard from "./MiningPoolCard";
import { useMiningWorkspace } from "../MiningWorkspaceProvider";
import { normalizeMiningDutchRows } from "../miningWorkspaceData";
import { TrendingUpIcon } from "../Icons.jsx";

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
      icon={<TrendingUpIcon size={15} color="#fbbf24" />}
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
