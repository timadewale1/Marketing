import Link from "next/link";
import Image from "next/image";

export default function SkillsServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-4 sm:px-6">
          <Link href="/skills-services" className="inline-flex items-center">
            <Image
              src="/Pamba.png"
              alt="PAMBA"
              width={120}
              height={44}
              className="h-10 w-auto object-contain"
              priority
            />
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
