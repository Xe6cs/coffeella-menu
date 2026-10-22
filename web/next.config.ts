import type { NextConfig } from "next";

// Cache Components is intentionally OFF: on the Cloudflare Workers runtime
// (OpenNext) requests using "use cache" hung during compatibility testing
// (Next warns that it cannot guarantee Cache Components there). The classic
// model (ISR + unstable_cache tags + revalidateTag) is fully supported.
const isPreview = process.env.NEXT_PUBLIC_DEPLOY_ENV === "preview";

const nextConfig: NextConfig = {
  async headers() {
    // Preview deployments must never be indexed by search engines.
    return isPreview ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }] : [];
  },
};

export default nextConfig;
