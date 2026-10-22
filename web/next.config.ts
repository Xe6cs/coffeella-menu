import type { NextConfig } from "next";

// Cache Components is intentionally OFF: on the Cloudflare Workers runtime
// (OpenNext) requests using "use cache" hung during compatibility testing
// (Next warns that it cannot guarantee Cache Components there). The classic
// model (ISR + unstable_cache tags + revalidateTag) is fully supported.
const nextConfig: NextConfig = {};

export default nextConfig;
