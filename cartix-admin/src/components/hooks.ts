import { useCallback, useEffect, useState } from 'react';

/** Short confirmation message in the corner; disappears after a few seconds. */
export function useToast(): [string | null, (message: string) => void] {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);
  return [toast, useCallback((m: string) => setToast(m), [])];
}

export const dhakaDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric' }) : '';
