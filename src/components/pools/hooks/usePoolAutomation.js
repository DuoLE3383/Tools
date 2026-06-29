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
}) {
  const [running, setRunning] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
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

  const startRun = useCallback(async () => {
    if (running || playing) return;
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

      if (playing) {
        runTimerRef.current = setTimeout(scheduleNextCycle, 1000);
        return;
      }

      setRunCount((prev) => prev + 1);
      setNextRunCountdown(null);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

      await verifyAllOnce({ resetStop: false, keepRunning: true });

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
  }, [running, playing, automationInterval, verifyAllOnce]);

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
      !playing &&
      !running
    ) {
      didAutoStartRef.current = true;
      const timer = setTimeout(() => {
        startRun();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [playing, running, startRun]);

  return {
    running,
    playing,
    progress,
    setProgress,
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