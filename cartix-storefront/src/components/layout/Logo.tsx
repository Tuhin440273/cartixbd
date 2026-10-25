import Image from 'next/image';
import Link from 'next/link';

/** The Cartix logo (bag icon and wordmark), linking to the home page. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  // The image is 426 x 120; both sizes keep that ratio.
  const height = size === 'sm' ? 32 : 40;
  return (
    <Link href="/" className="flex shrink-0 items-center" aria-label="Cartix home">
      <Image src="/logo/cartix-logo-horizontal.png" alt="Cartix" width={Math.round((426 / 120) * height)} height={height} priority={size === 'md'} />
    </Link>
  );
}
