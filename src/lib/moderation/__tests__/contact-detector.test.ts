import { describe, expect, it } from "vitest";
import { scanForContactDetails } from "@/lib/moderation/contact-detector";

describe("scanForContactDetails — Nigerian phone formats (PRD §9.3)", () => {
  const cases: Array<[string, string]> = [
    ["+234 with spaces", "Call me on +234 803 123 4567 for a quicker reply."],
    ["+234 with dashes", "Reach out: +234-803-123-4567."],
    ["+234 no separators", "My number is 2348031234567 if you want to chat."],
    ["0-prefixed with spaces", "You can reach me on 0803 123 4567 anytime."],
    ["0-prefixed with dashes", "Call 0803-123-4567 before you buy."],
    ["0-prefixed with dots", "Number: 0803.123.4567"],
    ["0-prefixed no separators", "08031234567 is my number."],
    ["bare, no leading 0", "803 123 4567, ask for Bola."],
    ["letter substitution O for 0 and I for 1", "O8O3I234567 works for calls."],
    ["mixed-case letter substitution", "call O8o3 123 4567 please"],
    ["spelled-out digits", "my number is zero eight zero three one two three four five six seven okay"],
  ];

  it.each(cases)("detects: %s", (_label, text) => {
    const result = scanForContactDetails(text);
    expect(result.detected).toBe(true);
    if (result.detected) {
      expect(result.detectedType).toBe("phone");
      expect(result.matchedText.length).toBeGreaterThan(0);
    }
  });
});

describe("scanForContactDetails — other contact channels", () => {
  it("detects an email address", () => {
    const result = scanForContactDetails("Contact me directly at seller@example.com for details.");
    expect(result).toEqual({ detected: true, detectedType: "email", matchedText: "seller@example.com" });
  });

  it("detects a WhatsApp mention", () => {
    const result = scanForContactDetails("Hit me up on WhatsApp instead of here.");
    expect(result.detected).toBe(true);
    if (result.detected) expect(result.detectedType).toBe("whatsapp");
  });

  it("detects a wa.me link", () => {
    const result = scanForContactDetails("Just message wa.me/sellerhandle for a quick reply.");
    expect(result.detected).toBe(true);
    if (result.detected) expect(result.detectedType).toBe("whatsapp");
  });

  it("classifies a wa.me link carrying an actual phone number as a phone detection", () => {
    // Arguably more actionable for moderation than the generic "whatsapp"
    // label — a literal number leaked, not just a platform mention.
    const result = scanForContactDetails("Just message wa.me/2348031234567");
    expect(result.detected).toBe(true);
    if (result.detected) expect(result.detectedType).toBe("phone");
  });

  it("detects an Instagram mention", () => {
    const result = scanForContactDetails("Follow my insta for more items.");
    expect(result.detected).toBe(true);
    if (result.detected) expect(result.detectedType).toBe("instagram");
  });

  it("detects a Telegram mention", () => {
    const result = scanForContactDetails("Message me on telegram for a discount.");
    expect(result.detected).toBe(true);
    if (result.detected) expect(result.detectedType).toBe("telegram");
  });

  it("detects a t.me link", () => {
    const result = scanForContactDetails("t.me/cool_seller");
    expect(result.detected).toBe(true);
    if (result.detected) expect(result.detectedType).toBe("telegram");
  });

  it("detects a bare @handle", () => {
    const result = scanForContactDetails("Reach me @cool_seller123 for questions.");
    expect(result.detected).toBe(true);
    if (result.detected) expect(result.detectedType).toBe("instagram");
  });

  it("detects a generic URL", () => {
    const result = scanForContactDetails("Check out http://example.com/mystore for more.");
    expect(result.detected).toBe(true);
    if (result.detected) expect(result.detectedType).toBe("url");
  });

  it("detects a bare www domain", () => {
    const result = scanForContactDetails("Visit www.mystore.ng today.");
    expect(result.detected).toBe(true);
    if (result.detected) expect(result.detectedType).toBe("url");
  });
});

describe("scanForContactDetails — clean text must not false-positive", () => {
  const cleanCases: Array<[string, string]> = [
    ["ordinary description", "Barely used foundation, still has box and receipt. Great condition."],
    ["size and wear", "Size 10, worn twice, no flaws, comes with original tags."],
    ["short price mention", "Selling for 25000 naira, fixed price only, no negotiation."],
    ["spec list", "Item includes charger and case. 128GB storage, battery health 92%."],
    ["set quantity", "Set of 6 plates, brand new, never used, no chips or cracks."],
    ["scattered non-consecutive number words", "I have two or three of these left, priced fairly for quick sale."],
    ["short date-like number", "Purchased on 12.03.2026, barely used since."],
    ["percentage and weight", "Battery health is 91 percent, weighs about 2.5kg total."],
  ];

  it.each(cleanCases)("does not flag: %s", (_label, text) => {
    const result = scanForContactDetails(text);
    expect(result.detected).toBe(false);
  });
});
