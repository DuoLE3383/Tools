import { useState, useEffect } from "react";

export const useRentalTimer = (isRented) => {
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (!isRented) return undefined;
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const timer = setInterval(updateNow, 30000);
    return () => clearInterval(timer);
  }, [isRented]);

  return nowMs;
};