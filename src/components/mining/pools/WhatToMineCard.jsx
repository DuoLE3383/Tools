// WhatToMineCard.jsx - Pool lookup card for WhatToMine
import MiningPoolCard from "./MiningPoolCard";
import { useMiningWorkspace } from "../MiningWorkspaceProvider";
import { normalizeWtmRows } from "../miningWorkspaceData";
import { NetworkIcon } from "../Icons.jsx";

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
      icon={<NetworkIcon size={15} color="#38bdf8" />}
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
