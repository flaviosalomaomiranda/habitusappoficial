import { useEffect, useMemo, useState } from "react";

function readValue<T>(key: string, initialValue: T, legacyKeys: readonly string[]): T {
  try {
    const item = window.localStorage.getItem(key);
    if (item) return JSON.parse(item) as T;
    for (const legacyKey of legacyKeys) {
      const legacyItem = window.localStorage.getItem(legacyKey);
      if (legacyItem) return JSON.parse(legacyItem) as T;
    }
    return initialValue;
  } catch {
    return initialValue;
  }
}

export default function useLocalStorage<T>(
  key: string,
  initialValue: T,
  legacyKeys: readonly string[] = []
) {
  const legacyKeySignature = useMemo(() => legacyKeys.join("|"), [legacyKeys]);
  const [storedValue, setStoredValue] = useState<T>(() =>
    readValue(key, initialValue, legacyKeys)
  );

  // ✅ quando a KEY muda (ex: troca de usuário), recarrega do localStorage correto
  useEffect(() => {
    setStoredValue(readValue(key, initialValue, legacyKeys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, legacyKeySignature]);

  // ✅ sempre salva no localStorage da KEY atual
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch {}
  }, [key, storedValue]);

  return [storedValue, setStoredValue] as const;
}
