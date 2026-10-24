import { SearchIcon } from '@/components/ui/icons';

/** Plain GET form: search works even before JavaScript loads. */
export function SearchForm({ defaultValue = '' }: { defaultValue?: string }) {
  return (
    <form action="/search" method="get" role="search" className="relative w-full max-w-xl">
      <label htmlFor="site-search" className="sr-only">
        Search products
      </label>
      <input
        id="site-search"
        name="q"
        type="search"
        defaultValue={defaultValue}
        maxLength={100}
        placeholder="Search for shirts, hoodies, kurti..."
        className="input h-10 rounded-full pl-10 pr-4"
      />
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
    </form>
  );
}
