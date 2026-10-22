import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";
import kvNextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/kv-next-tag-cache";

// TEMPORARY configuration for local previews only — not the final choice.
// Cache Components is off (it hung under Workers); the classic ISR model is
// used. The final cache setup is pending the owner's decision between the
// tested variants in cloudflare/variants/ (r2-d1-do, kv-d1-do). See README.
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: kvNextTagCache,
  queue: memoryQueue,
});
