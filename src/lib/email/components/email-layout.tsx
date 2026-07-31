import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

/**
 * Shared wrapper for every transactional email (PRD §12.1: React Email).
 * Structure only — "Template copy: structure defined, wording not" (§13
 * Definition of Done item 14) leaves exact wording to the builder; this is
 * that structure, reused by every template in `src/lib/email/templates/`.
 */
export function EmailLayout({
  previewText,
  heading,
  children,
}: {
  previewText: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: "#f4f4f5", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 8, padding: "32px", maxWidth: 480, margin: "0 auto" }}>
          <Text style={{ fontSize: 14, fontWeight: 700, color: "#18181b", letterSpacing: "-0.01em", margin: "0 0 24px" }}>
            Urs2Cash
          </Text>
          <Heading as="h1" style={{ fontSize: 20, color: "#18181b", margin: "0 0 16px" }}>
            {heading}
          </Heading>
          <Section>{children}</Section>
          <Hr style={{ borderColor: "#e4e4e7", margin: "32px 0 16px" }} />
          <Text style={{ fontSize: 12, color: "#71717a", margin: 0 }}>
            Urs2Cash — a peer-to-peer recommerce marketplace. This is a transactional email about your account
            activity.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailText({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontSize: 14, color: "#3f3f46", lineHeight: "22px", margin: "0 0 12px" }}>{children}</Text>
  );
}

export function EmailDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Text style={{ fontSize: 14, color: "#3f3f46", lineHeight: "20px", margin: "0 0 4px" }}>
      <span style={{ color: "#71717a" }}>{label}:</span> <span style={{ fontWeight: 600 }}>{value}</span>
    </Text>
  );
}
