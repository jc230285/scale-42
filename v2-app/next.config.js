/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We host CMS + Preview from the same image. The MODE env var (cms|preview)
  // controls runtime behaviour; both read NEXT_PUBLIC_SUPABASE_* envs.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "giga-42.com" },
    ],
  },
  output: "standalone",
};

module.exports = nextConfig;
