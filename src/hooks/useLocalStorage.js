import { useState, useEffect } from 'react';

// A simple versioning system for our local storage data.
// If we change the data structure, we can increment this version.
const DATA_VERSION = '1.5'; // Bump version again to force a hard reset of inconsistent data

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        const parsedItem = JSON.parse(item);
        // Check if the data has a version and if it matches the current version
        if (parsedItem.version === DATA_VERSION) {
          return parsedItem.data;
        }
      }
      // If no item, version mismatch, or error, return initial value
      return initialValue;
    } catch (error) {
      console.error('Error reading from localStorage', error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      // Wrap the data with a version number before saving
      const itemToStore = {
        version: DATA_VERSION,
        data: value,
      };
      window.localStorage.setItem(key, JSON.stringify(itemToStore));
    } catch (error) {
      console.error('Error writing to localStorage', error);
    }
  }, [key, value]);

  return [value, setValue];
}
