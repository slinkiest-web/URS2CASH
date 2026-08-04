import Link from "next/link";
import { NewsletterForm } from "@/components/newsletter-form";

/**
 * urs2cash-ui skill, Footer spec (Revision 4). Every link, mark, and claim
 * here is real for this product today (non-negotiable #9) — no social
 * icons (no real account exists yet), no generic payment-logo assortment
 * (Visa/Mastercard/Verve are what Paystack actually processes in this
 * market), no links to pages this app doesn't have (Careers, Investors,
 * Sitemap).
 */
export function SiteFooter() {
  const supportEmail = process.env["NEXT_PUBLIC_SUPPORT_EMAIL"] ?? "support@urs2cash.com";
  const year = new Date().getFullYear();

  return (
    // Design/UX pass Stage 3c: same warm gradient as the header, so the
    // two dark bookends of every page read as one deliberate register
    // rather than two separately-toned blacks.
    <footer
      className="mt-auto text-white"
      style={{ background: "linear-gradient(115deg, var(--u2c-ink-warm-start) 0%, var(--u2c-ink) 60%)" }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 border-b border-white/10 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-12">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-white/70">
            Get notified about new arrivals
          </span>
          <p className="text-[13px] text-white/50">We will only email you when there is something worth seeing.</p>
        </div>
        <div className="w-full sm:max-w-sm">
          <NewsletterForm />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 border-b border-white/10 px-4 py-6 sm:px-6 lg:px-12">
        <span className="text-[13px] text-white/50">Payments secured by Paystack</span>
        <div className="flex items-center gap-2">
          {["Visa", "Mastercard", "Verve"].map((mark) => (
            <span
              key={mark}
              className="rounded-[3px] border border-white/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.03em] text-white/70"
            >
              {mark}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6 lg:px-12">
        <div className="flex flex-col gap-3">
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/50">Help</span>
          <a href={`mailto:${supportEmail}`} className="text-[15px] text-white/80 hover:text-white">
            Contact support
          </a>
          <Link href="/orders" className="text-[15px] text-white/80 hover:text-white">
            Track your order
          </Link>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/50">Account</span>
          <Link href="/sell" className="text-[15px] text-white/80 hover:text-white">
            Sell an item
          </Link>
          <Link href="/dashboard/listings" className="text-[15px] text-white/80 hover:text-white">
            My listings
          </Link>
          <Link href="/sign-in" className="text-[15px] text-white/80 hover:text-white">
            Sign in
          </Link>
        </div>
        <div className="col-span-2 flex flex-col gap-3 sm:col-span-1">
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/50">About Urs2Cash</span>
          <p className="max-w-xs text-[15px] text-white/80">
            A peer to peer marketplace for pre-owned goods in Nigeria. List what you no longer need, buy what you
            need next, with payment held safely until delivery is confirmed.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 text-[13px] text-white/50 sm:px-6 lg:px-12">
        © {year} Urs2Cash
      </div>
    </footer>
  );
}
