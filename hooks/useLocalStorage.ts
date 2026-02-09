import { useEffect, useState } from "react";

function readValue<T>(key: string, initialValue: T): T {
  try {
    const item = window.localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : initialValue;
  } catch {
    return initialValue;
  }
}

export default function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => readValue(key, initialValue));

  // ✅ quando a KEY muda (ex: troca de usuário), recarrega do localStorage correto
  useEffect(() => {
    setStoredValue(readValue(key, initialValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // ✅ sempre salva no localStorage da KEY atual
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch {}
  }, [key, storedValue]);

  return [storedValue, setStoredValue] as const;
}
