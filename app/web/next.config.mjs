import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';
import { fileURLToPath } from 'node:url';

export default phase => ({
  ...(phase === PHASE_DEVELOPMENT_SERVER ? {
    async rewrites() {
      const target = process.env.ONESHOT_BACKEND_TARGET;
      if (!target) return [];
      return ['api', 'v1'].map(prefix => ({ source: `/${prefix}/:path*`, destination: `${target}/${prefix}/:path*` }));
    },
  } : { output: 'export' }),
  poweredByHeader: false,
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  images: { unoptimized: true },
});
