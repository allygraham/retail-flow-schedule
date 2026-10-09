// Vitest cannot resolve Deno's npm: URLs. Tests explicitly mock these exports.
export function init() { throw new Error('Mock the Deno Sentry SDK in browser tests'); }
export function captureMessage() { throw new Error('Mock the Deno Sentry SDK in browser tests'); }
export function flush() { throw new Error('Mock the Deno Sentry SDK in browser tests'); }
