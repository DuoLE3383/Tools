// HashrateNoCard.jsx - Pool lookup card for Hashrate.no
import MiningPoolCard from "./MiningPoolCard";
import { useMiningWorkspace } from "../MiningWorkspaceProvider";
import { normalizeHashrateNoRows } from "../miningWorkspaceData";
import { BoxIcon } from "../Icons.jsx";

export default function HashrateNoCard() {
  const {
    hashrateNoStats,
    hashrateNoLoading,
    hashrateNoError,
    refresh,
  } = useMiningWorkspace();

  const rows = normalizeHashrateNoRows(hashrateNoStats);

  return (
    <MiningPoolCard
      title="Hashrate.no"
      icon={<BoxIcon size={15} color="#818cf8" />}
      accent="#818cf8"
      rows={rows}
      loading={hashrateNoLoading}
      error={hashrateNoError}
      lastUpdated={hashrateNoStats?.fetchedAt}
      onRefresh={() => refresh(true)}
      filterKey="btcPerDay"
    />
  );
}
