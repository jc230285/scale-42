/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "giga-42.com" },
    ],
  },
  output: "standalone",
  // The home/preview routes read live-site HTML templates from /lib at runtime.
  // standalone tracing won't catch fs.readFileSync of constant-but-non-required
  // paths, so include them explicitly.
  experimental: {
    outputFileTracingIncludes: {
      "/": ["./lib/_*.html"],
      "/[...slug]": ["./lib/_*.html"],
    },
  },
};

module.exports = nextConfig;
