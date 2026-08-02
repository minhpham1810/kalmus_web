"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

type TutorialTab = "search" | "analysis";

const HUE_LIGHT_SWATCH_ROYAL_BLUE = "#213ac9";
const HUE_LIGHT_SWATCH_NAVY_BLUE = "#13217b";

function LoopingVideo({
  src,
  className = "",
}: {
  src: string;
  className?: string;
}) {
  return (
    <video
      className={className}
      autoPlay
      loop
      muted
      playsInline
      disablePictureInPicture
      style={{ pointerEvents: "none" }}
    >
      <source src={src} type="video/webm" />
    </video>
  );
}
function SearchTable({
  rows,
}: {
  rows: { category: string; example: React.ReactNode; result: string }[];
}) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b" style={{ borderColor: "rgba(128,128,128,0.3)" }}>
          <th className="text-left py-2 pr-4 font-mono text-xs uppercase tracking-wider kalmus-text-secondary">
            Category
          </th>
          <th className="text-left py-2 pr-4 font-mono text-xs uppercase tracking-wider kalmus-text-secondary">
            Example
          </th>
          <th className="text-left py-2 font-mono text-xs uppercase tracking-wider kalmus-text-secondary">
            Result
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={i}
            className="border-b"
            style={{ borderColor: "rgba(128,128,128,0.15)" }}
          >
            <td className="py-3 pr-4 align-top">{row.category}</td>
            <td className="py-3 pr-4 align-top font-mono text-xs">
              {row.example}
            </td>
            <td className="py-3 align-top kalmus-text-secondary">
              {row.result}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export default function TutorialPage() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref = from === "admin" ? "/admin" : "/";
  const [activeTab, setActiveTab] = useState<TutorialTab>("search");
  const getTabStyle = (isActive: boolean) => ({
    background: isActive ? "var(--foreground)" : "var(--surface-bg)",
    color: isActive ? "var(--background)" : "var(--text-primary)",
    borderColor: isActive ? "var(--foreground)" : "var(--input-border)",
  });
  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="fixed top-5 left-6 z-50">
            <Link
              href={backHref}
              className="text-m kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
            >
              ← Back{from === "admin" ? " to Admin" : ""}
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
          <p className="text-center font-mono text-sm tracking-[0.35em] uppercase kalmus-text-secondary mb-8">
            Tutorials
          </p>
          <div className="flex justify-center gap-2 mb-10">
            <button
              onClick={() => setActiveTab("search")}
              className="px-6 py-2 border rounded text-sm font-mono uppercase tracking-wider transition-colors"
              style={getTabStyle(activeTab === "search")}
            >
              Search
            </button>
            <button
              onClick={() => setActiveTab("analysis")}
              className="px-6 py-2 border rounded text-sm font-mono uppercase tracking-wider transition-colors"
              style={getTabStyle(activeTab === "analysis")}
            >
              Analysis
            </button>
          </div>
          <div className="kalmus-text-primary font-light leading-relaxed">
            {activeTab === "search" && (
              <div className="space-y-8">
                <section className="space-y-4">
                  <Image
                    src="/tutorial/search_bar.png"
                    alt="KALMUS search bar"
                    width={900}
                    height={200}
                    className="w-full h-auto"
                  />
                  <p>
                    The KALMUS search bar allows you to find film in
                    different ways. Clicking on a letter shows films whose
                    title starts with that letter. Clicking on &ldquo;Surprise
                    Me!&rdquo; displays a list of five random films from the
                    archive.
                  </p>
                  <p>
                    In addition to searching by title, KALMUS allows advanced
                    search queries. Popular approaches are below.
                  </p>
                </section>
                <section className="space-y-4">
                  <SearchTable
                    rows={[
                      {
                        category: "Exact Matching",
                        example: <>&ldquo;new york&rdquo;</>,
                        result: "only films with the words new york",
                      },
                      {
                        category: "Wildcard",
                        example: "rom*",
                        result: "films starting with the prefix",
                      },
                      {
                        category: "Category Search",
                        example: "director: hitchcock",
                        result: "films directed by hitchcock",
                      },
                    ]}
                  />
                  <p>
                    Search categories include title, director, actor,
                    writer, genre, country, language, year, and year range
                    (e.g. 2011 - 2015).
                  </p>
                  <SearchTable
                    rows={[
                      {
                        category: "Multiple terms",
                        example: (
                          <>
                            director: toro
                            <br />
                            country: mexico
                          </>
                        ),
                        result: "returns films directed by toro from mexico",
                      },
                      {
                        category: "Boolean Operators (AND, OR, NOT)",
                        example: "genre: romance AND genre: fantasy",
                        result: "returns films with both genres",
                      },
                      {
                        category: "Grouping",
                        example: "(thriller NOT romance) AND country: Japan",
                        result:
                          "returns thriller films but excludes romances, but only from Japan",
                      },
                    ]}
                  />
                </section>
              </div>
            )}
            {activeTab === "analysis" && (
              <div className="space-y-8">
                <section className="space-y-4">
                  <p className="underline uppercase mb-2.5">Barcode</p>
                  <p>
                    After selecting a film, KALMUS first loads a barcode. The
                    BARCODE is &ldquo;read&rdquo; top to bottom and then left
                    to right. The upper left corner represents the start of
                    the film and the lower right is the film&apos;s end.
                    Each vertical column represents about eight seconds of
                    the film. Hovering over the BARCODE loads the
                    corresponding frame into the frame viewer.
                  </p>
                  <LoopingVideo
                    src="/tutorial/Kalmus_barcode_hover.webm"
                    className="w-full h-auto"
                  />
                </section>
                <section className="space-y-4">
                  <p className="underline uppercase mb-2.5">Frame Viewer</p>
                  <p>
                    The FRAME VIEWER shows the frame number and timecode of
                    the frame&apos;s location in the film. It
                    also displays the frame&apos;s RGB and HSL value plus the
                    average color of the column. Clicking on the BARCODE
                    &ldquo;pins&rdquo; the frame in the viewer which allows
                    the frame (and its details) to be exported. Clicking the
                    &ldquo;RELEASE&rdquo; button unpins the frame and
                    re-enables hovering. Finally, the &ldquo;MINIMIZE&rdquo;
                    button shrinks the frame viewer window.
                  </p>
                </section>
                <section className="space-y-4">
                  <p className="underline uppercase mb-2.5">
                    Visualizations
                  </p>
                  <p>
                    Below the FRAME VIEWER are six tabs of visualizations and
                    comparisons. The first three - HUE HISTOGRAM,
                    HUE/LIGHTNESS SCATTER, and HUE/LIGHTNESS 3D work similar
                    to the BARCODE: hovering over or clicking on the
                    visualization, loads the corresponding frame into the
                    FRAME VIEWER. By default, the visualizations show the
                    entire film. However, adjusting the vertical white bars
                    on either side of the BARCODE allow users to visualize
                    particular film segments. Holding the shift key between
                    the white bars allows both bars to move in sync.
                  </p>
                  <LoopingVideo
                    src="/tutorial/kalmus_barcode_segment.webm"
                    className="w-full h-auto"
                  />
                </section>
                <section className="space-y-4">
                  <p className="underline uppercase mb-2.5">Histogram</p>
                  <p>
                    The HISTOGRAM organizes the film&apos;s frames by hue on
                    the horizontal axis and the number of frames on the
                    vertical axis. This gives the viewer a quick sense of the
                    relative amounts of color used across the film or in a
                    particular segment. By default, the HISTOGRAM uses the
                    OKLCH (
                    <a
                      href="https://en.wikipedia.org/wiki/Oklab_color_space"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:opacity-80"
                    >
                      link
                    </a>
                    ) color space and KALMUS filters frames with low
                    chromaticity (in simple terms, frames with very little
                    saturation near black, white, and grey). Switching the
                    HUE MODE to &ldquo;HSV&rdquo; visualizes the raw values.
                  </p>
                </section>
                <section className="space-y-4">
                  <p className="underline uppercase mb-2.5">
                    Hue/Lightness Scatter
                  </p>
                  <div className="flex gap-6 items-start">
                    <p className="flex-1">
                      The next visualization provides more nuance. The
                      HISTOGRAM &ldquo;buckets&rdquo; colors by hue but
                      doesn&apos;t distinguish between lightness. For
                      example, a hue of 230 could be &ldquo;Royal
                      Blue&rdquo; (at top) if bright and saturated or also
                      &ldquo;Navy Blue&rdquo; (at bottom) with less
                      lightness. Same hue but very different looking
                      colors.

                      <br />
                      <br />
                      The HUE/LIGHTNESS SCATTER divides the frames by hue
                    (horizontally) but also indicates degrees of lightness
                    (vertically). Darker frames gravitate toward the bottom,
                    whereas brighter frames are plotted at the top.
                    </p>
                    <div className="flex flex-col gap-6.5 shrink-0">
                      <div
                        className="w-20 h-20"
                        style={{ background: HUE_LIGHT_SWATCH_ROYAL_BLUE }}
                      />
                      <div
                        className="w-20 h-20"
                        style={{ background: HUE_LIGHT_SWATCH_NAVY_BLUE }}
                      />
                    </div>
                  </div>

                </section>
                <section className="space-y-4">
                  <p className="underline uppercase mb-2.5">
                    Hue/Lightness 3D
                  </p>
                  <p>
                    The HUE/LIGHTNESS 3D chart adds even more information
                    with a third axis indicating the number of frames for a
                    particular hue/lightness combination. The chart can be
                    rotated and zoomed in and also reset to different
                    viewpoints (top, diagonal, hue, lightness).
                  </p>
                </section>
                <section className="space-y-4">
                  <p className="underline uppercase mb-2.5">Frame Scatter</p>
                  <p className="kalmus-text-secondary">Coming soon!</p>
                </section>
                <section className="space-y-4">
                  <p className="underline uppercase mb-2.5">Statistics</p>
                  <p>
                    KALMUS will also calculate average and dominant colors
                    for a whole film or a selected segment.
                  </p>
                  <LoopingVideo
                    src="/tutorial/kalmus_stats.webm"
                    className="w-full h-auto"
                  />
                </section>
                <section className="space-y-4">
                  <p className="underline uppercase mb-2.5">Compare</p>
                  <p className="kalmus-text-secondary">Coming soon!</p>
                </section>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}