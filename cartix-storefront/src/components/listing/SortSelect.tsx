'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function SortSelect({ sorts, current }: { sorts: { value: string; label: string }[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="text-sm text-muted">Sort by</label>
      <select
        id="sort"
        className="input w-auto py-2"
        value={current}
        onChange={(e) => {
          const qs = new URLSearchParams(search.toString());
          qs.set('sort', e.target.value);
          qs.delete('page');
          router.push(`${pathname}?${qs.toString()}`);
        }}
      >
        {sorts.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}
