import Link from "next/link";
import Image from "next/image";

export default async function AboutPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const backHref = from === "admin" ? "/admin" : "/";
  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="fixed top-5 left-6 z-50">
            <Link
              href={backHref}
              className="text-base kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
            >
              ← Back
            </Link>
          </div>
          <div className="flex justify-center mb-8">
            <Image
              src="/kalmus-logo.png"
              alt="KALMUS"
              width={300}
              height={100}
              className="dark:invert"
              style={{ height: "auto" }}
              priority
            />
          </div>
          <div className="space-y-8 text-base kalmus-text-primary font-light leading-relaxed">
            <section className="space-y-4">
              <p className="underline uppercase mb-2.5">Introduction</p>
              <p>
                KALMUS is an archive for studying film color through different
                visualizations and statistical comparisons. It is named in
                honor of Technicolor&apos;s Natalie Kalmus who oversaw the
                color palettes on almost 400 Hollywood feature films from
                1928 - 1956.
              </p>
            </section>
            <section className="space-y-4">
              <p className="underline uppercase mb-2.5">
                &ldquo;On Wednesdays We Wear Pink&rdquo;
              </p>
              <div>
                <figure className="float-right w-full md:w-[420px] ml-8 mb-4">
                  <Image
                    src="/checker_illusion.png"
                    alt='Color subjectivity: Professor Edward Adelson&apos;s "Checker Shadow" illusion from 1995. Squares "A" and "B" are the same color despite their perceptual difference.'
                    width={480}
                    height={520}
                    className="w-full h-auto"
                  />
                  <figcaption className="text-sm kalmus-text-secondary mt-2">
                    Color subjectivity: Professor Edward Adelson&apos;s
                    &ldquo;Checker Shadow&rdquo; illusion from 1995. Squares
                    &ldquo;A&rdquo; and &ldquo;B&rdquo; are the same color
                    despite their perceptual difference.
                  </figcaption>
                </figure>
                <p>
                  For typical viewers, it is actually difficult to
                  objectively &ldquo;see&rdquo; and remember how a film uses
                  color. After all, films are in constant motion with colors
                  shifting and changing as the film unspools. In addition,
                  our color perception (and memory) can be subjective and
                  depends on how filmmakers utilize light, shadow, and
                  contrast.
                </p>
                <p className="mt-4">
                  To study a film&apos;s color palette requires video editing
                  applications or very specialized software like VIAN (
                  <a
                    href="https://github.com/FilmColors/VIAN"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:opacity-80"
                  >
                    link
                  </a>
                  ) all of which have steep learning curves. By contrast,
                  KALMUS is designed for scholars and students to quickly and
                  easily visualize and quantify how films organize color.
                </p>
                <div className="clear-both" />
              </div>
            </section>
            <section className="space-y-4">
              <p className="underline uppercase mb-2.5">
                &ldquo;A Better Barcode&rdquo;
              </p>
              <p>
                KALMUS starts by generating a color barcode of a film. A
                barcode typically captures each frame&apos;s color and then
                stitches it into a mosaic. While film barcodes have long
                existed (ETSY is filled with vendors happy to sell you a
                barcode of your favorite film!), they often suffer from two
                problems.
              </p>
              <p>
                First, many programs simply reduce a film frame to a single
                pixel which produces inconsistent colors (see{" "}
                <em>Blade Runner 2049</em> &nbsp; example below). Second, most
                barcode software doesn&apos;t retain any color data so other
                analyses or comparisons can&apos;t be performed or
                visualized. By contrast, KALMUS retains each frame&apos;s
                color data and thus can produce additional visualizations
                (histograms, scatter charts, etc.) as well as statistical
                summaries and comparisons.
              </p>
              <figure className="flex flex-col md:flex-row md:items-center gap-6 w-full">
                <Image
                  src="/blade_runner_still.png"
                  alt="A still from Blade Runner 2049"
                  width={900}
                  height={500}
                  className="w-full md:w-4/5 h-auto"
                />
                <figcaption className="text-sm kalmus-text-secondary md:w-1/5">
                  A still from <em>Blade Runner 2049</em>. A frame reduction
                  in Photoshop produces RGB (74, 36, 1) but a frame reduction
                  in Apple Preview produces RGB (98, 48, 3). Meanwhile the
                  actual average of all the pixels is RGB (87, 43, 2).
                </figcaption>
              </figure>
            </section>
            <section className="space-y-4">
              <p className="underline uppercase mb-2.5">Background</p>
              <p>
                Kalmus was developed at Bucknell University by Film/Media
                Studies professor Eric Faden. Collaborating with
                Mathematician and colleague Nathan Ryan, they conceptualized
                the software&apos;s features and parameters. Undergraduate
                student Yida Chen worked with them to develop an open source
                Python package in 2021.
              </p>
              <p>
                In 2024, Bucknell students Laura Ozoria and Jackson
                Rubiano took over from Chen and expanded Kalmus&apos;
                visualizations. In addition, they migrated the Python code
                to a server and website. In 2025, undergraduate Minh Pham
                joined the team to build the website&apos;s front end. In
                summer 2026, Ozoria rejoined the project focusing on
                Kalmus&apos; database as well as developing several new
                visualizations and outputs.
              </p>
            </section>
            <section className="space-y-4">
              <p className="underline uppercase mb-2.5">Contact</p>
              <p>
                <a
                  href="mailto:kalmus@bucknell.edu"
                  className="kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
                >
                  kalmus@bucknell.edu
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}