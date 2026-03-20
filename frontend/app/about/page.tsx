import Link from "next/link";
import Image from "next/image";

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      {/* Top Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-amber-500/10 bg-black/40 backdrop-blur-md">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-amber-500/60 hover:text-amber-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-xs font-mono tracking-wider">[BACK]</span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-amber-500/60 font-mono">
            <span>SYSTEM_INFO</span>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 pt-28 pb-12">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-center mb-10 opacity-0 animate-[fade-in-up_0.6s_ease-out_forwards]">
            <Image
              src="/kalmus-logo.png"
              alt="KALMUS"
              width={200}
              height={67}
              className="dark:invert opacity-90"
              priority
            />
          </div>

          <div className="panel border border-amber-500/20 rounded p-8 relative overflow-hidden opacity-0 animate-[fade-in-up_0.6s_ease-out_0.1s_forwards]">
            {/* Decorative corners */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-amber-500/30" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-amber-500/30" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-amber-500/30" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-amber-500/30" />

            <div className="space-y-6 text-sm text-neutral-300 font-mono leading-relaxed">
              <div className="text-xs text-amber-500/80 uppercase tracking-widest mb-6 flex items-center gap-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                SYSTEM_DOCUMENTATION
              </div>

              <p className="text-neutral-400">
                <span className="text-cyan-400/80">KALMUS</span> is a film color analysis system 
                that generates visual &ldquo;barcodes&rdquo; representing the chromatic signature 
                of cinema. Each vertical stripe in a barcode corresponds to the dominant 
                color of a frame or sequence.
              </p>

              <div className="border-l-2 border-amber-500/30 pl-4">
                <p className="text-amber-100/70 italic">
                  // &ldquo;Color is a power which directly influences the soul.&rdquo;
                </p>
                <p className="text-xs text-amber-500/50 mt-1">
                  - Wassily Kandinsky
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-amber-500/80 uppercase tracking-wider text-xs">
                  CAPABILITIES:
                </h3>
                <ul className="space-y-2 text-neutral-400">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500/60 mt-1">{'>'}</span>
                    <span>Generate color and brightness barcodes from video files</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500/60 mt-1">{'>'}</span>
                    <span>Analyze hue distribution, RGB color space, and lightness patterns</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500/60 mt-1">{'>'}</span>
                    <span>Compare films side-by-side for chromatic analysis</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500/60 mt-1">{'>'}</span>
                    <span>Export data for further research and visualization</span>
                  </li>
                </ul>
              </div>

              <div className="pt-4 border-t border-amber-500/10">
                <p className="text-xs text-neutral-500">
                  Built on the{" "}
                  <a 
                    href="https://github.com/KALMUS-Color-Toolkit/KALMUS" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-amber-500/60 hover:text-amber-400 transition-colors"
                  >
                    KALMUS Python toolkit
                  </a>
                  {" "}// Processed via HPC cluster infrastructure
                </p>
              </div>
            </div>
          </div>

          {/* Version info */}
          <div className="mt-6 text-center opacity-0 animate-[fade-in-up_0.6s_ease-out_0.2s_forwards]">
            <p className="text-xs font-mono text-neutral-500">
              VERSION: <span className="text-amber-500/60">2.0.0</span> // 
              STATUS: <span className="text-cyan-400/60">OPERATIONAL</span>
            </p>
          </div>
        </div>
      </main>

      <footer className="py-8 border-t border-amber-500/10">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-neutral-500">
            <p>
              POWERED_BY{" "}
              <a
                href="https://github.com/KALMUS-Color-Toolkit/KALMUS"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-500/60 hover:text-amber-400 transition-colors"
              >
                KALMUS_TOOLKIT
              </a>
            </p>
            <p className="text-neutral-600">
              v2.0.0 // FILM_COLOR_ANALYSIS_SYSTEM
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
