import { useState, useEffect } from 'react';
import { calculateRemainingTime } from '../../../core/time.js';

export const useRigTimers = (isRented, startTime, endTime, explicitDuration) => {
  const [timeProgress, setTimeProgress] = useState(0);
  const [remainingTimeStr, setRemainingTimeStr] = useState('');
  const [durationHours, setDurationHours] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);

  useEffect(() => {
    if (!isRented || !startTime || !endTime) {
      setTimeProgress(0);
      setRemainingTimeStr('');
      setDurationHours(0);
      setElapsedMs(0);
      setTotalMs(0);
      return;
    }

    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const now = Date.now();

    if (isNaN(start) || isNaN(end)) {
      setTimeProgress(0);
      setRemainingTimeStr('');
      setDurationHours(0);
      setElapsedMs(0);
      setTotalMs(0);
      return;
    }

    const total = end - start;
    const elapsed = Math.max(0, Math.min(now - start, total));
    const progress = total > 0 ? (elapsed / total) * 100 : 0;

    // Calculate duration in hours
    const hours = total / (1000 * 60 * 60);
    const duration = explicitDuration > 0 ? explicitDuration : hours;

    setTotalMs(total);
    setElapsedMs(elapsed);
    setTimeProgress(progress);
    setDurationHours(duration);

    // Update remaining time string
    const remaining = calculateRemainingTime(endTime);
    setRemainingTimeStr(remaining);

    // Set up interval for countdown updates
    const interval = setInterval(() => {
      const now2 = Date.now();
      const elapsed2 = Math.max(0, Math.min(now2 - start, total));
      const progress2 = total > 0 ? (elapsed2 / total) * 100 : 0;
      setTimeProgress(progress2);
      setElapsedMs(elapsed2);
      
      const remaining2 = calculateRemainingTime(endTime);
      setRemainingTimeStr(remaining2);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRented, startTime, endTime, explicitDuration]);

  return {
    timeProgress,
    remainingTimeStr,
    durationHours,
    elapsedMs,
    totalMs
  };
};

// ✅ Default export for the hook
export default useRigTimers;