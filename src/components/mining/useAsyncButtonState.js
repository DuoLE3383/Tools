import { useState, useEffect, useCallback } from 'react';

/**
 * Manages the state of a button that performs an async operation.
 * @param {number} resetDelay - The delay in ms before resetting from 'success' or 'error' to 'idle'.
 * @returns {{status: string, setStatus: function, trigger: function}}
 */
export function useAsyncButtonState(resetDelay = 3000) {
  const [status, setStatus] = useState('idle'); // idle | running | success | error

  useEffect(() => {
    if (status === 'success' || status === 'error') {
      const timer = setTimeout(() => {
        setStatus('idle');
      }, resetDelay);
      return () => clearTimeout(timer);
    }
  }, [status, resetDelay]);

  const trigger = useCallback(async (asyncFn) => {
    if (status === 'running') return;
    setStatus('running');
    try {
      await asyncFn();
      setStatus('success');
    } catch (error) {
      setStatus('error');
    }
  }, [status]);

  return { status, setStatus, trigger };
}