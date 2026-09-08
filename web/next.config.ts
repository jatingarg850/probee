import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Enable React strict mode
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname, '..'),
  },

  // Optimize images
  images: {
    unoptimized: true,
  },

  experimental: {
    // Rewrites barrel imports to deep per-module imports at compile time.
    //
    // `@/components/ui/icons` re-exports from `@phosphor-icons/react`, whose
    // entry point is a 192KB barrel referencing ~1500 icon modules. Without
    // this, every one of the 24 files that imports an icon pulls that whole
    // graph — and in dev, where nothing is tree-shaken, it is compiled and
    // re-compiled on each of them. Next optimises a handful of popular
    // packages by default; Phosphor is not one of them, so it is named here.
    // `drei` and `date-fns` are barrels for the same reason.
    optimizePackageImports: ['@phosphor-icons/react', '@react-three/drei', 'date-fns'],
  },

  // No rewrites(): every one of these paths (/api/get_config, /startAgent,
  // /stopAgent, /panelState, /getAssessment, /analyzeResume, /matchJobs) used
  // to be proxied straight to the Python backend from here, unauthenticated.
  // Each now has its own `app/api/.../route.ts` handler that requires a
  // signed-in caller (`getAuthedUserId`) before forwarding to the backend —
  // see that route's own comment on why: this backend spends real money per
  // call (Agora minutes, Gemini, a scrape), and a bare rewrite has no way to
  // check who is asking.
  //
  // A rewrite here would have been dead weight either way: Next only applies
  // an array-returned rewrite *after* checking filesystem routes for an exact
  // path match, and every path above already has one. Removed rather than
  // left in place looking like it does something.
}

export default nextConfig
