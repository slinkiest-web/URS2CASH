/**
 * Vitest-only stand-in for the `server-only` package (vitest.config.ts
 * aliases the real import to this file). The real package throws unless
 * imported through Next's own server-component bundling, which vitest
 * doesn't provide — this is the standard way to unit-test a server-only
 * module's pure logic (e.g. `verifyWebhookSignature` in
 * src/lib/paystack/index.ts) without weakening the real `import
 * "server-only"` guard that ships to production.
 */
export {};
