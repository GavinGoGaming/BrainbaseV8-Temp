"use client";
import { useState, useEffect } from 'react';

function useLocalStorage(key: string, initialValue: any) {
  const [thing, setThing] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch (error) {
      // console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(thing));
    } catch (error) {
      // console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, thing]);

  return [thing, setThing];
}

export default useLocalStorage;