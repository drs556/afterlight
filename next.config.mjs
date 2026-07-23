/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Don't serve a cached client-side render for dynamic (force-dynamic) pages
    // on navigation — always refetch. Otherwise Opportunities/Runs can show a
    // stale snapshot (e.g. pre-score) when reached via a nav link (docs/01 §3).
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
