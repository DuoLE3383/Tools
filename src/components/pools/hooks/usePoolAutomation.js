// components/pools/hooks/usePoolAutomation.js
import { useState, useRef, useEffect, useCallback } from "react";

export function usePoolAutomation({
  onCall,
  nhClient,
  pools,
  filePools,
  extractedPools,
  useExtractedPools,
  verifyFromFile,
  verifyAllOnce,
  setVerifyResults,
  setResponse,
  isVerifying = false,
}) {
  const [running, setRunning] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [currentRunStartTime, setCurrentRunStartTime] = useState(null);
  const [currentRunElapsed, setCurrentRunElapsed] = useState(0);
  const [lastRunTime, setLastRunTime] = useState(null);
  const [nextRunCountdown, setNextRunCountdown] = useState(null);
  const [rateLimitStatus, setRateLimitStatus] = useState(null);
  const [lastRunSummary, setLastRunSummary] = useState(null);
  const [verificationDelay, setVerificationDelay] = useState(2345);
  const [automationInterval, setAutomationInterval] = useState(3);

  const stopRef = useRef(false);
  const runTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const activeRequestRef = useRef(null);
  const didAutoStartRef = useRef(false);
  // Live "a verification loop is already in flight" flag. Read through a ref so
  // the long-running cycle closure never acts on a stale render value.
  const isVerifyingRef = useRef(Boolean(isVerifying));

  useEffect(() => {
    isVerifyingRef.current = Boolean(isVerifying);
  }, [isVerifying]);

  const startRun = useCallback(async () => {
    if (running || isVerifyingRef.current) return;
    setRunning(true);
    setRunCount(0);
    setCurrentRunStartTime(Date.now());
    stopRef.current = false;

    const intervalMs = automationInterval * 1000;

    const scheduleNextCycle = async () => {
      if (stopRef.current) {
        setRunning(false);
        return;
      }

      if (isVerifyingRef.current) {
        runTimerRef.current = setTimeout(scheduleNextCycle, 1000);
        return;
      }

      setRunCount((prev) => prev + 1);
      setNextRunCountdown(null);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

      // resetStop must stay true: the verification loop owns its own stop flag,
      // so leaving it set after a Stop would abort every following cycle.
      await verifyAllOnce({ resetStop: true, keepRunning: true });

      const finishedAt = new Date();
      setLastRunTime(finishedAt.toLocaleTimeString());

      if (stopRef.current) {
        setRunning(false);
        return;
      }

      let remaining = intervalMs / 1000;
      setNextRunCountdown(remaining);

      countdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        setNextRunCountdown(remaining > 0 ? remaining : 0);
        if (remaining <= 0) {
          clearInterval(countdownTimerRef.current);
          scheduleNextCycle();
        }
      }, 1000);
    };

    scheduleNextCycle();
  }, [running, automationInterval, verifyAllOnce]);

  const stopAutomation = useCallback(() => {
    stopRef.current = true;
    setRunning(false);
    if (runTimerRef.current) {
      clearInterval(runTimerRef.current);
      runTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setNextRunCountdown(null);
    }
    if (activeRequestRef.current) {
      activeRequestRef.current.abort();
      activeRequestRef.current = null;
    }
    setCurrentRunStartTime(null);
    setRunCount(0);
    setLastRunTime(null);
  }, []);

  // Update elapsed time
  useEffect(() => {
    let interval;
    if (running && currentRunStartTime) {
      interval = setInterval(() => {
        setCurrentRunElapsed(
          Math.floor((Date.now() - currentRunStartTime) / 1000)
        );
      }, 1000);
    } else {
      setCurrentRunElapsed(0);
    }
    return () => clearInterval(interval);
  }, [running, currentRunStartTime]);

  // Auto-start from URL parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("start") === "true" &&
      !didAutoStartRef.current &&
      !isVerifying &&
      !running
    ) {
      didAutoStartRef.current = true;
      const timer = setTimeout(() => {
        startRun();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isVerifying, running, startRun]);

  return {
    running,
    runCount,
    currentRunElapsed,
    lastRunTime,
    nextRunCountdown,
    rateLimitStatus,
    setRateLimitStatus,
    lastRunSummary,
    setLastRunSummary,
    verificationDelay,
    setVerificationDelay,
    automationInterval,
    setAutomationInterval,
    startRun,
    stopAutomation,
    stopRef,
    activeRequestRef,
  };
}
