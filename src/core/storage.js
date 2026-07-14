// /home/duole/Tools/src/core/storage.js

/**
 * Loads a value from localStorage and parses it as JSON.
 * @param {string} key The storage key.
 * @param {*} defaultValue The default value to return if the key is not found or parsing fails.
 * @returns {object|array|*} The parsed JSON object or the default value.
 */
export function loadJsonFromStorage(key, defaultValue) {
  if (typeof window === 'undefined') {
    return defaultValue;
  }
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.warn(`Could not load/parse JSON from storage for key "${key}"`, error);
    return defaultValue;
  }
}

/**
 * Saves a value to localStorage by stringifying it.
 * @param {string} key The storage key.
 * @param {object|array} value The object to save.
 */
export function saveJsonToStorage(key, value) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not save JSON to storage for key "${key}"`, error);
  }
}

/**
 * Loads a string value from localStorage.
 * @param {string} key The storage key.
 * @param {string} defaultValue The default value.
 * @returns {string} The loaded string or default.
 */
export function loadStringFromStorage(key, defaultValue) {
  if (typeof window === 'undefined') {
    return defaultValue;
  }
  try {
    const item = localStorage.getItem(key);
    return item !== null ? item : defaultValue;
  } catch (error) {
    console.warn(`Could not load string from storage for key "${key}"`, error);
    return defaultValue;
  }
}

/**
 * Saves a string value to localStorage.
 * @param {string} key The storage key.
 * @param {string|number|boolean} value The value to save.
 */
export function saveStringToStorage(key, value) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, String(value));
  } catch (error) {
    console.warn(`Could not save string to storage for key "${key}"`, error);
  }
}