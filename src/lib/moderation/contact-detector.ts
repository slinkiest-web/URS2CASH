/**
 * Contact-detail detector. PRD §9.3.
 *
 * HARD RULE: this is a moderation concern, not a submission gate. Detection
 * flags and records; it never blocks. A detection creates a `moderation_flags`
 * row (source `auto_contact_detect`) and fires `contact_detail_flagged` — the
 * listing (or review) still publishes/submits either way. There is no block
 * path anywhere in this module or any of its call sites, and there must never
 * be one added.
 *
 * Tuned for RECALL over precision (§9.3): "a false positive now costs a
 * moderator thirty seconds rather than costing a seller her listing." Every
 * pattern below is deliberately generous. Nigerian phone detection in
 * particular must survive spacing/dashing/dotting and light obfuscation
 * (spelled-out digits, O/I/l letter substitution for 0/1) without requiring
 * exact formatting.
 *
 * Detects, in priority order (first match wins — callers create at most one
 * moderation flag per scan, matching Epic B1 AC9b's "exactly one
 * moderation_flags row"):
 *   1. phone      — Nigerian mobile numbers: +234, 0-prefixed local, bare
 *                    (no leading 0), spaced/dashed/dotted, letter-substituted
 *                    (O/o/I/i/L/l standing in for 0/1), and spelled-out digits
 *                    ("zero eight zero three ...").
 *   2. email
 *   3. whatsapp   — "whatsapp"/"whats app" mentions, wa.me links.
 *   4. instagram  — "instagram"/"insta"/"IG:" mentions, instagram.com links,
 *                    bare @handles.
 *   5. telegram   — "telegram"/"tg:" mentions, t.me links.
 *   6. url        — generic http(s)/www links and bare common-TLD domains.
 *
 * TODO(prompt 18 — Epic D6, submitRating): rating `review` text must be
 * scanned the same way at submission (§7.1 HARD RULE: "review text is
 * scanned by the contact detector per 9.3 on submission, flagged not
 * blocked"). When `src/lib/actions/ratings.ts` is created, call
 * `scanForContactDetails(input.review ?? "")` after the rating insert
 * succeeds, and on a hit insert a `moderation_flags` row (source
 * `auto_contact_detect`, `listing_id` = the order's listing, `pattern_type`/
 * `matched_text` from the result) via the service-role client, then fire
 * `contact_detail_flagged` — same shape as the listing call sites in
 * src/lib/actions/listings.ts. Do not block the rating submission.
 */
export type ContactDetectionType = "phone" | "email" | "whatsapp" | "instagram" | "telegram" | "url";

export type ContactDetectionResult =
  | { detected: true; detectedType: ContactDetectionType; matchedText: string }
  | { detected: false };

// --- Nigerian phone number detection -----------------------------------

/** Letters that plausibly stand in for a digit when obfuscating a phone number. */
const LETTER_TO_DIGIT: Record<string, string> = {
  o: "0",
  i: "1",
  l: "1",
};

/** Spelled-out digit words, including the common "oh" for zero. */
const NUMBER_WORD_TO_DIGIT: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

/**
 * A normalized digit string (no separators, letters already substituted) is
 * a Nigerian phone number if it matches one of:
 *   - 0 + 10 digits (11 digits total) — standard local format, e.g. 0803...
 *   - 234 + 10 digits (13 digits total) — country code without the "+"
 *   - 7/8/9 + 9 digits (10 digits total, no leading 0) — the local number
 *     with the leading 0 dropped, common when copying a +234 number.
 */
function isNigerianPhoneShape(digits: string): boolean {
  if (/^0\d{10}$/.test(digits)) return true;
  if (/^234\d{10}$/.test(digits)) return true;
  if (/^[789]\d{9}$/.test(digits)) return true;
  return false;
}

/**
 * Digit / letter-substituted / separated candidate windows. Deliberately
 * broad (this is the recall layer) — `isNigerianPhoneShape` is the actual
 * precision filter, applied after separators are stripped and substitute
 * letters are normalized back to digits.
 *
 * The leading/trailing `(?<![a-zA-Z0-9])`/`(?![a-zA-Z0-9])` boundaries are
 * load-bearing, not cosmetic: since O/I/L are both valid phone-substitute
 * letters AND ordinary English letters, an unanchored greedy match will
 * happily absorb a stray letter from an adjacent word across a space (e.g.
 * the "i" in "...4567 if you..." or the "ll" in "Call 0803...") into the
 * candidate, which then gets letter-substituted into the digit string and
 * corrupts the shape check. Requiring a non-alphanumeric boundary on both
 * sides forces the match to snap to the actual token, not bleed into
 * surrounding prose.
 */
const PHONE_CANDIDATE_RE = /(?<![a-zA-Z0-9])\+?[\dOoIiLl][\dOoIiLl\s.\-]{7,14}[\dOoIiLl](?![a-zA-Z0-9])/g;

function normalizePhoneCandidate(candidate: string): string {
  return candidate
    .replace(/[\s.\-+]/g, "")
    .toLowerCase()
    .split("")
    .map((ch) => LETTER_TO_DIGIT[ch] ?? ch)
    .join("");
}

function findDigitPhone(text: string): string | null {
  const matches = text.match(PHONE_CANDIDATE_RE);
  if (!matches) return null;

  for (const candidate of matches) {
    const normalized = normalizePhoneCandidate(candidate);
    if (isNigerianPhoneShape(normalized)) {
      return candidate.trim();
    }
  }

  return null;
}

/**
 * Spelled-out phone numbers ("zero eight zero three one two three four five
 * six seven"). Requires a run of at least 7 consecutive number-word tokens —
 * short of that, ordinary prose mentioning a couple of quantities ("two of
 * these are new") would false-positive constantly.
 */
function findSpelledPhone(text: string): string | null {
  const tokens = text.split(/[^a-zA-Z]+/).filter(Boolean);
  let runStart = -1;

  for (let i = 0; i <= tokens.length; i++) {
    const word = tokens[i]?.toLowerCase();
    const isNumberWord = word !== undefined && Object.prototype.hasOwnProperty.call(NUMBER_WORD_TO_DIGIT, word);

    if (isNumberWord) {
      if (runStart === -1) runStart = i;
      continue;
    }

    if (runStart !== -1) {
      const runLength = i - runStart;
      if (runLength >= 7) {
        const digits = tokens
          .slice(runStart, i)
          .map((w) => NUMBER_WORD_TO_DIGIT[w.toLowerCase()])
          .join("");
        if (isNigerianPhoneShape(digits)) {
          return tokens.slice(runStart, i).join(" ");
        }
      }
      runStart = -1;
    }
  }

  return null;
}

function findPhone(text: string): string | null {
  return findDigitPhone(text) ?? findSpelledPhone(text);
}

// --- Other contact channels ---------------------------------------------

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

const WHATSAPP_RE = /whats?\s*-?\s*app|wa\.me\/\S+/i;

const INSTAGRAM_RE = /\binstagram\b|\binsta\b|\bIG\s*[:@]?\s*@?\w+|instagram\.com\/\S+/i;

const TELEGRAM_RE = /\btelegram\b|\btg\s*[:@]\s*@?\w+|t\.me\/\S+/i;

/** Bare @handle, e.g. "@sellername" — a common Instagram/Telegram drop-in without naming the platform. */
const BARE_HANDLE_RE = /(?<![\w.@])@[a-zA-Z][a-zA-Z0-9_.]{2,}/;

const URL_RE = /https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|ng|me|co|io|link)\b/i;

/**
 * Scans a block of user-generated text for contact-detail leakage signals.
 * Returns at most one detection (the first match, in priority order) — never
 * throws, never signals "block this". Callers must always proceed with their
 * write; a detection only ever produces a moderation flag + event alongside
 * the normal, successful outcome.
 */
export function scanForContactDetails(text: string): ContactDetectionResult {
  const phone = findPhone(text);
  if (phone) {
    return { detected: true, detectedType: "phone", matchedText: phone };
  }

  const email = text.match(EMAIL_RE)?.[0];
  if (email) {
    return { detected: true, detectedType: "email", matchedText: email };
  }

  const whatsapp = text.match(WHATSAPP_RE)?.[0];
  if (whatsapp) {
    return { detected: true, detectedType: "whatsapp", matchedText: whatsapp };
  }

  const instagram = text.match(INSTAGRAM_RE)?.[0];
  if (instagram) {
    return { detected: true, detectedType: "instagram", matchedText: instagram };
  }

  const telegram = text.match(TELEGRAM_RE)?.[0];
  if (telegram) {
    return { detected: true, detectedType: "telegram", matchedText: telegram };
  }

  const handle = text.match(BARE_HANDLE_RE)?.[0];
  if (handle) {
    return { detected: true, detectedType: "instagram", matchedText: handle };
  }

  const url = text.match(URL_RE)?.[0];
  if (url) {
    return { detected: true, detectedType: "url", matchedText: url };
  }

  return { detected: false };
}
