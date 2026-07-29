import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext adapter config for Cloudflare Workers.
 *
 * Deliberately minimal: every page in this app is dynamic (auth or per-client
 * data on every route), so there is no ISR cache worth wiring an R2 bucket up
 * for. Add `incrementalCache` here if static pages appear later.
 */
export default defineCloudflareConfig();
