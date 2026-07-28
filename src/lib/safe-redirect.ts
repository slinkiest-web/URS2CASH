/**
 * Returns `value` if it is a safe same-origin relative path, otherwise `fallback`.
 *
 * A bare `startsWith("/")` check is not enough: `//evil.com` and `/\evil.com`
 * both start with `/` too, and browsers treat both as protocol-relative URLs
 * pointing at a different host. Since redirect targets in this app come from
 * user-controlled query parameters (`?redirectTo=`, `?next=`), an unguarded
 * check is an open redirect.
 */
export function sanitizeRedirectPath(value: unknown, fallback: string): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
  ) {
    return value;
  }
  return fallback;
}
