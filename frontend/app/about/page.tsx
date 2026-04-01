import Link from "next/link";
import Image from "next/image";

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="mb-10">
            <Link
              href="/"
              className="text-xs kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
            >
              ← Back
            </Link>
          </div>

          <div className="flex justify-center mb-8">
            <Image
              src="/kalmus-logo.png"
              alt="KALMUS"
              width={160}
              height={54}
              className="dark:invert"
              priority
            />
          </div>

          <div className="space-y-6 text-sm kalmus-text-secondary font-light leading-relaxed">


            <p>Contents go here
            </p>

          </div>
        </div>
      </main>
    </div>
  );
}
