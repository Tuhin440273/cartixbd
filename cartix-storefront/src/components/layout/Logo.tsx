import Link from 'next/link';

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 text-ink" aria-label="Cartix home">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-black text-white">C</span>
      <span className="text-xl font-extrabold tracking-tight">Cartix</span>
    </Link>
  );
}
