// WhatToMineCard.jsx - Pool lookup card for WhatToMine
import MiningPoolCard from "./MiningPoolCard";
import { useMiningWorkspace } from "../MiningWorkspaceProvider";
import { normalizeWtmRows } from "../miningWorkspaceData";

export default function WhatToMineCard() {
  const {
    wtmStats,
    wtmLoading,
    wtmError,
    refresh,
  } = useMiningWorkspace();

  const rows = normalizeWtmRows(wtmStats);

  return (
    <MiningPoolCard
      title="WhatToMine"
      icon="⛏"
      accent="#38bdf8"
      rows={rows}
      loading={wtmLoading}
      error={wtmError}
      lastUpdated={wtmStats?.fetchedAt}
      onRefresh={() => refresh(true)}
      filterKey="btcPerDay"
    />
  );
}
