/**
 * Server action result convention (PRD §11.3).
 *
 * HARD RULE: server actions never throw to the client. They return this
 * discriminated union. Internal detail is logged server-side, never returned.
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T = never>(
  code: string,
  message: string,
  field?: string
): Result<T> {
  return { ok: false, error: field !== undefined ? { code, message, field } : { code, message } };
}
