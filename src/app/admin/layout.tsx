import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * §10 Epic E5 AC1: no metadata, no indexing — this surface has no public
 * audience by design ("no SEO" per this prompt's brief).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Defense in depth, not the security boundary: middleware
 * (src/middleware.ts) already 404s a non-admin before this layout ever
 * renders, so this second check is redundant for anyone going through the
 * app's own routing. It exists anyway because §11.2's HARD RULE — "every
 * admin action re-verifies admin role from the database, middleware
 * protection is not sufficient" — is best honoured by never having a
 * single point of failure for authorization on this whole surface. Uses
 * the identical `requireAdmin()` every server action also calls, so there
 * is exactly one definition of "is an admin" in this codebase, not two
 * that could drift.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin.ok) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <nav className="flex flex-wrap items-center gap-4 border-b border-zinc-200 pb-4 text-sm dark:border-zinc-800">
        <span className="font-semibold text-zinc-900 dark:text-zinc-50">Admin</span>
        <Link href="/admin/moderation" className="text-zinc-600 hover:underline dark:text-zinc-400">
          Moderation
        </Link>
        <Link href="/admin/disputes" className="text-zinc-600 hover:underline dark:text-zinc-400">
          Disputes
        </Link>
        <Link href="/admin/payouts" className="text-zinc-600 hover:underline dark:text-zinc-400">
          Payouts
        </Link>
        <Link href="/admin/reviews" className="text-zinc-600 hover:underline dark:text-zinc-400">
          Reviews
        </Link>
        <Link href="/admin/sellers" className="text-zinc-600 hover:underline dark:text-zinc-400">
          Sellers
        </Link>
      </nav>
      {children}
    </div>
  );
}
