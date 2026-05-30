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

          <div className="space-y-6 text-base kalmus-text-primary font-light leading-relaxed">
            <section className="space-y-4">
              <p className="underline uppercase mb-2.5">Introduction</p>
              <p>
                Kalmus is an application for analyzing film color through
                different visualizations and statistical comparisons. The
                website is designed for scholars, students, and film fans to
                easily visualize and quantify how a particular film organizes
                its color palette. It is named in honor of Technicolor&apos;s
                Natalie Kalmus who oversaw the color palettes on almost 400
                Hollywood feature films from 1928 - 1956.
              </p>
              <p>
                The website maintains an archive of barcodes using different
                metrics (average, mean, mode, etc.) and frame types (whole
                frame, foreground, high contrast regions, etc.). For instance, a
                barcode of &ldquo;average&rdquo; and &ldquo;whole frame&rdquo;
                averages each film frame&apos;s color. The software then
                stitches the frame&apos;s average color into a mosaic so users
                can perceive a film&apos;s overall palette.
              </p>
              <p>
                While film barcodes have been generated before, Kalmus retains
                each frames&apos; data and thus can produce additional
                visualizations (histograms, scatter charts) as well as
                statistical summaries and comparisons.
              </p>
            </section>

            <section className="space-y-4">
              <p className="underline uppercase mb-2.5">
                About The Barcode And Visualizations
              </p>
              <Image
                src="/kalmus-description.png"
                alt="KALMUS Description"
                width={1150}
                height={307}
                sizes="(max-width: 768px) 100vw, 672px"
                className="w-full h-auto"
              />
              <p>
                The barcode is &ldquo;read&rdquo; top to bottom and then left to
                right. The upper left corner represents the start of the film
                and the lower right is the film&apos;s ending. Each vertical row
                represents about 8 seconds of the film. The wider white bars can
                be adjusted to isolate parts of the film by dragging them to the
                appropriate start and end point which dynamically updates the
                visualizations and statistics. Users can also enter a specific
                range of frames in the bottom row for precise visualizations.
                Hovering over the barcode or visualizations displays a frame in
                the viewer. For the barcode, the frame represents that moment in
                the film. For the visualizations, a frame is chosen at random
                that matches the hue and/or lightness in the visualization.
              </p>
            </section>
            {/* Info Panel */}
            <div className="p-4 kalmus-surface">
              <h4 className="font-mono text-xs tracking-[0.3em] uppercase kalmus-text-secondary mb-2">
                ▸ About These Visualizations
              </h4>
              <ul className="font-mono text-xs kalmus-text-secondary space-y-1">
                <li>
                  <strong>Statistics:</strong> Overview of barcode metadata, dominant colors, and
                  brightness distribution
                </li>
                <li>
                  <strong>Histogram:</strong>{" "}
                  Distribution of color hues (0-360°) across all frames
                </li>
                <li>
                  <strong>RGB Cube:</strong> 3D scatter plot of RGB colors in the barcode (drag to
                  rotate)
                </li>
                <li>
                  <strong>Hue/Light Scatter:</strong> 2D scatter plot showing hue vs lightness
                  distribution
                </li>
                <li>
                  <strong>Hue/Light 3D:</strong> 3D visualization of color distribution with
                  adjustable resolution and camera controls
                </li>
                <li>
                  <strong>Compare:</strong> Side-by-side barcode comparison with similarity metrics
                  (SSIM, NRMSE, cross-correlation, sequence alignment)
                </li>
                <li>
                  <strong>Export CSV:</strong> Download per-frame color/brightness data with frame
                  indices
                </li>
              </ul>
            </div>
            <p className="underline uppercase mb-2.5">Using The Archive</p>
            <div className="mb-2.5 text-sm kalmus-text-secondary font-light">
              <p>Basic search</p>
              <div className="flex flex-col gap-1 mb-2">
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">
                      kubrick
                    </span>
                    <p className="text-xs mt-1">single word</p>
                  </div>
                  <p className="pt-0.5">
                    Returns entries where any category contains with
                    &ldquo;kubrick&rdquo;
                  </p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">
                      new york
                    </span>
                    <p className="text-xs mt-1">multiple words</p>
                  </div>
                  <p className="pt-0.5">
                    Both terms most appear; terms do not need to appear in the
                    same category
                  </p>
                </div>
              </div>

              <p>Exact & Prefix Matching</p>
              <div className="flex flex-col gap-1 mb-2">
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">
                      &ldquo;new york&rdquo;
                    </span>
                    <p className="text-xs mt-1">quoted phrase</p>
                  </div>
                  <p className="pt-0.5">
                    Matches the exact phrase; words must appear together in that
                    order
                  </p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">
                      rom*
                    </span>
                    <p className="text-xs mt-1">wildcard prefix</p>
                  </div>
                  <p className="pt-0.5">
                    The * wildcard matches anything starting with the prefix
                  </p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">
                      ^the
                    </span>
                    <p className="text-xs mt-1">category start anchor</p>
                  </div>
                  <p className="pt-0.5">
                    The ^ requires the term appear as the first word of a
                    column&apos;s value
                  </p>
                </div>
              </div>

              <p>Category Search</p>
              <div className="flex flex-col gap-1 mb-2">
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">
                      director: hitchcock
                    </span>
                    <p className="text-xs mt-1">single category</p>
                  </div>
                  <p className="pt-0.5">
                    Searches only a single column for the term. Available
                    categories:
                  </p>
                  <p className="pt-0.5">
                    title, director, actor, writer, genre, country, language
                  </p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">
                      director: damien chazelle
                    </span>
                    <p className="text-xs mt-1">multiple terms</p>
                  </div>
                  <p className="pt-0.5">
                    All terms following a category label are search for within
                    that category until a new category label appears
                  </p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">
                      director: toro country: mexico
                    </span>
                    <p className="text-xs mt-1">chaining categories</p>
                  </div>
                  <p className="pt-0.5">
                    Searches for entries with all category searches matching
                  </p>
                </div>
              </div>

              <p>Boolean Operators</p>
              <div className="flex flex-col gap-1 mb-2">
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">
                      romance AND fantasy
                    </span>
                    <p className="text-xs mt-1">AND operator</p>
                  </div>
                  <p className="pt-0.5">Both conditions must match</p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">
                      thriller OR comedy
                    </span>
                    <p className="text-xs mt-1">OR operator</p>
                  </div>
                  <p className="pt-0.5">Either conditions matches</p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">
                      romance NOT fantasy
                    </span>
                    <p className="text-xs mt-1">NOT operator</p>
                  </div>
                  <p className="pt-0.5">Excludes matching entries</p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">
                      (romance NOT fantasy) AND hitchcock
                    </span>
                    <p className="text-xs mt-1">() grouping</p>
                  </div>
                  <p className="pt-0.5">
                    Use parentheses to control evaluation order; terms inside
                    are handled first
                  </p>
                </div>
              </div>

              <p>Example Queries</p>
              <div className="kalmus-search-row">
                <div>
                  <span className="kalmus-text-primary kalmus-search-tag">
                    director: hitchcock
                  </span>
                </div>
                <p className="pt-0.5 text-right">Films directed by hitchcock</p>
                <div>
                  <span className="kalmus-text-primary kalmus-search-tag">
                    genre: rom*
                  </span>
                </div>
                <p className="pt-0.5 text-right">All romance-related genres</p>
                <div>
                  <span className="kalmus-text-primary kalmus-search-tag">
                    &ldquo;the&rdquo; NOT genre: romance
                  </span>
                </div>
                <p className="pt-0.5 text-right">
                  Exact phrase, exluding a genre
                </p>
                <div>
                  <span className="kalmus-text-primary kalmus-search-tag">
                    director: hitch country: states OR french
                  </span>
                </div>
                <p className="pt-0.5 text-right">Chained categories with OR</p>
                <div>
                  <span className="kalmus-text-primary kalmus-search-tag">
                    language: english OR (country: mexico language: french)
                  </span>
                </div>
                <p className="pt-0.5 text-right">Grouped conditions</p>
              </div>
            </div>

            <section className="space-y-4">
              <p className="underline uppercase mb-2.5">Background</p>
              <p>
                Kalmus was developed at Bucknell University by Film/Media
                Studies professor Eric Faden. Collaborating with Mathematician
                and colleague Nathan Ryan, they conceptualized the
                software&apos;s features and parameters. Undergraduate student
                Yida Chen worked with them to develop an open source Python
                package in 2021 (with accompanying article here).
              </p>
              <p>
                In 2024, Bucknell students Laura Ozoria and Jackson
                Rubiano took over from Yida Chen (who graduated and is in
                Harvard&apos;s Computer Science PhD program at the
                university&apos;s Insight + Interaction Lab). Ozoria and Rubiano
                expanded Kalmus&apos; visualizations and migrated the code from
                a Python application to a website. In 2025, undergraduate Minh
                Pham joined the team to build the website&apos;s front end.
              </p>
              <p>
                In summer 2026, Ozoria rejoins the project focusing on
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
