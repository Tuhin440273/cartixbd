import type { NextConfig } from 'next';

const apiUrl = new URL(process.env.CARTIX_API_URL ?? 'http://127.0.0.1:8000/api/v1');
const extraOrigins = (process.env.CARTIX_IMAGE_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
  .map((o) => new URL(o));

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const allowLocalImages =
  process.env.NODE_ENV !== 'production' ||
  process.env.CARTIX_ALLOW_LOCAL_IMAGES === 'true' ||
  LOCAL_HOSTS.has(apiUrl.hostname);

const toPattern = (u: URL) => ({
  protocol: u.protocol.replace(':', '') as 'http' | 'https',
  hostname: u.hostname,
  port: u.port,
  pathname: '/**',
});

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [toPattern(apiUrl), ...extraOrigins.map(toPattern)],
    // Next.js refuses to optimize images from local addresses (protection against request forgery).
    // That is only relaxed when the API itself runs on this machine (a laptop or test setup), or when
    // CARTIX_ALLOW_LOCAL_IMAGES=true. A live site with a public API domain keeps the protection.
    dangerouslyAllowLocalIP: allowLocalImages,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
