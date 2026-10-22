import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

// Owner decision (preliminary): r2-d1-do — OpenNext's documented setup for small
// sites with on-demand revalidation. Cache Components stays off (it hung under
// Workers); the classic ISR model + revalidateTag is used. R2 requires an R2
// subscription on the Cloudflare account (see README, Cloudflare section).
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  tagCache: d1NextTagCache,
  queue: doQueue,
});
