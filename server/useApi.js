import { useState, useCallback } from "react";

/**
 * A custom hook to abstract API calls, loading, and error states.
 *
 * This hook manages the lifecycle of an API request, providing a consistent
 * way to handle loading indicators, error messages, and the resulting data.
 *
 * @param {function} apiFunc - The function that performs the API call. It must return a promise.
 * @returns {{
 *   data: any,
 *   setData: function,
 *   loading: boolean,
 *   error: string|null,
 *   request: function(...[*]): Promise<any>
 * }} An object containing the state and the request function.
 */
export function useApi(apiFunc) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const request = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFunc(...args);
        setData(result);
        return result; // Return the result for immediate use or chaining
      } catch (err) {
        const errorMessage =
          err.message || "An unexpected error occurred during the API request.";
        setError(errorMessage);
        console.error(`[useApi] Error in function ${apiFunc.name}:`, err);
        throw err; // Re-throw for the caller to handle if needed
      } finally {
        setLoading(false);
      }
    },
    [apiFunc],
  );

  return { data, setData, loading, error, request };
}