import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh px-4 py-6 sm:px-8">
      <header className="mx-auto mb-10 flex max-w-3xl items-center justify-between">
        <Link href="/">
          <Logo size={28} />
        </Link>
        <nav className="flex gap-4 text-[13px] font-semibold text-muted">
          <Link href="/legal/privacidad" className="hover:text-text">
            Privacidad
          </Link>
          <Link href="/legal/cookies" className="hover:text-text">
            Cookies
          </Link>
          <Link href="/legal/terminos" className="hover:text-text">
            Términos
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl pb-16 text-[15px] leading-relaxed text-text-2 [&_h1]:mb-2 [&_h1]:font-display [&_h1]:text-[30px] [&_h1]:font-semibold [&_h1]:text-text [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:text-text [&_li]:mt-1.5 [&_p]:mt-3 [&_table]:mt-4 [&_table]:w-full [&_table]:text-[14px] [&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:border-b [&_th]:border-border-strong [&_th]:py-2 [&_th]:pr-3 [&_th]:text-left [&_th]:text-text [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </main>
    </div>
  );
}
