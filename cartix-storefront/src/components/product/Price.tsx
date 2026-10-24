import { formatPrice } from '@/lib/format';

export function Price({
  price,
  maxPrice,
  compareAt,
  size = 'md',
}: {
  price: string;
  maxPrice?: string | null;
  compareAt?: string | null;
  size?: 'md' | 'lg';
}) {
  const range = maxPrice && Number(maxPrice) > Number(price);
  const showCompare = compareAt && Number(compareAt) > Number(price);
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 ${size === 'lg' ? 'text-2xl' : 'text-base'}`}>
      <span className="font-bold text-ink">
        {range ? `${formatPrice(price)} - ${formatPrice(maxPrice)}` : formatPrice(price)}
      </span>
      {showCompare && (
        <span className={`text-subtle line-through ${size === 'lg' ? 'text-base' : 'text-sm'}`}>
          <span className="sr-only">Regular price </span>
          {formatPrice(compareAt)}
        </span>
      )}
    </p>
  );
}
