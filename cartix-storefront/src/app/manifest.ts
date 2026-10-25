import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/config';

/** Lets phones add the shop to the home screen with the Cartix icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} | Online shopping in Bangladesh`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563EB',
    icons: [
      { src: '/logo/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/logo/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/logo/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
