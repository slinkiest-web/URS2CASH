import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { AUTH_MARKETING_IMAGE } from "@/lib/images/marketing";

/**
 * Design/UX pass Stage 3b: the shared split-screen shell for sign in and
 * sign up, replacing both pages' previous bare centred-form-on-white-page
 * layout. Left panel is a full-height marketing image (never product
 * photography — this is exactly the "purely decorative" exception carved
 * out in the urs2cash-ui skill's non-negotiable #2 for the auth split
 * screen specifically); right panel is the actual form, `children`.
 *
 * Collapses to a shorter image band above the form below the `lg`
 * breakpoint rather than hiding the image outright — a mobile-first
 * marketplace's sign-in page still gets to feel warm, not just functional,
 * and the image is what carries that.
 */
export function AuthSplitScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col lg:flex-row">
      <div className="relative h-56 w-full shrink-0 overflow-hidden bg-u2c-ink sm:h-72 lg:h-auto lg:w-1/2">
        <Image src={AUTH_MARKETING_IMAGE} alt="" fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(0deg, rgba(17,17,17,0.7) 0%, rgba(17,17,17,0.05) 45%, rgba(17,17,17,0.35) 100%)" }}
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-end p-6 sm:p-10">
          <div className="flex max-w-xs flex-col gap-2">
            <ShieldCheck size={22} strokeWidth={1.75} className="text-white" aria-hidden />
            <p className="font-display text-xl font-extrabold leading-snug text-white sm:text-2xl">
              Buy and sell pre-loved, with confidence
            </p>
            <p className="text-[15px] text-white/80">
              Your money is safe until you get your item, on every order.
            </p>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col justify-center bg-u2c-canvas px-6 py-12 sm:px-10 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}
