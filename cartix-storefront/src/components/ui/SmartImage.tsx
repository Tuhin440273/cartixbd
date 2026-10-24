import Image, { type ImageProps } from 'next/image';

/**
 * next/image wrapper. Vector images (the demo artwork) are served as-is: optimizing them adds
 * nothing and SVG optimization is disabled for security. Raster images go through the optimizer.
 */
export function SmartImage({ alt, ...props }: ImageProps) {
  const src = typeof props.src === 'string' ? props.src : '';
  const isSvg = /\.svg(\?|$)/i.test(src);
  return <Image alt={alt} {...props} unoptimized={isSvg || props.unoptimized} />;
}
