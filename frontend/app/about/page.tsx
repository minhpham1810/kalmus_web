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
            <p className="underline uppercase mb-2.5">
              Using The Archive
            </p>
            <div className="mb-2.5 text-sm kalmus-text-secondary font-light">
              <p>Basic search</p>
              <div className="flex flex-col gap-1 mb-2">
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">kubrick</span>
                    <p className="text-xs mt-1">single word</p>
                  </div>
                  <p className="pt-0.5">Returns entries where any category contains with "kubrick"</p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">new york</span>
                    <p className="text-xs mt-1">multiple words</p>
                  </div>
                  <p className="pt-0.5">Both terms most appear; terms do not need to appear in the same category</p>
                </div>
              </div>

              <p>Exact & Prefix Matching</p>
              <div className="flex flex-col gap-1 mb-2">
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">"new york"</span>
                    <p className="text-xs mt-1">quoted phrase</p>
                  </div>
                  <p className="pt-0.5">Matches the exact phrase; words must appear together in that order</p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">rom*</span>
                    <p className="text-xs mt-1">wildcard prefix</p>
                  </div>
                  <p className="pt-0.5">The * wildcard matches anything starting with the prefix</p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">^the</span>
                    <p className="text-xs mt-1">category start anchor</p>
                  </div>
                  <p className="pt-0.5">The ^ requires the term appear as the first word of a column's value</p>
                </div>
              </div>

              <p>Category Search</p>
              <div className="flex flex-col gap-1 mb-2">
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">director: hitchcock</span>
                    <p className="text-xs mt-1">single category</p>
                  </div>
                  <p className="pt-0.5">Searches only a single column for the term. Available categories:</p>
                  <p className="pt-0.5">title, director, actor, writer, genre, country, language</p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">director: damien chazelle</span>
                    <p className="text-xs mt-1">multiple terms</p>
                  </div>
                  <p className="pt-0.5">All terms following a category label are search for within that category until a new category label appears</p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">director: toro country: mexico</span>
                    <p className="text-xs mt-1">chaining categories</p>
                  </div>
                  <p className="pt-0.5">Searches for entries with all category searches matching</p>
                </div>
              </div>

              <p>Boolean Operators</p>
              <div className="flex flex-col gap-1 mb-2">
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">romance AND fantasy</span>
                    <p className="text-xs mt-1">AND operator</p>
                  </div>
                  <p className="pt-0.5">Both conditions must match</p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">thriller OR comedy</span>
                    <p className="text-xs mt-1">OR operator</p>
                  </div>
                  <p className="pt-0.5">Either conditions matches</p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">romance NOT fantasy</span>
                    <p className="text-xs mt-1">NOT operator</p>
                  </div>
                  <p className="pt-0.5">Excludes matching entries</p>
                </div>
                <div className="kalmus-search-row">
                  <div>
                    <span className="kalmus-text-primary kalmus-search-tag">(romance NOT fantasy) AND hitchcock</span>
                    <p className="text-xs mt-1">() grouping</p>
                  </div>
                  <p className="pt-0.5">Use parentheses to control evaluation order; terms inside are handled first</p>
                </div>
              </div>

              <p>Example Queries</p>
              <div className="kalmus-search-row">
                <div>
                  <span className="kalmus-text-primary kalmus-search-tag">director: hitchcock</span>
                </div>
                <p className="pt-0.5 text-right">Films directed by hitchcock</p>
                <div>
                  <span className="kalmus-text-primary kalmus-search-tag">genre: rom*</span>
                </div>
                <p className="pt-0.5 text-right">All romance-related genres</p>
                <div>
                  <span className="kalmus-text-primary kalmus-search-tag">"the" NOT genre: romance</span>
                </div>
                <p className="pt-0.5 text-right">Exact phrase, exluding a genre</p>
                <div>
                  <span className="kalmus-text-primary kalmus-search-tag">director: hitch country: states OR french</span>
                </div>
                <p className="pt-0.5 text-right">Chained categories with OR</p>
                <div>
                  <span className="kalmus-text-primary kalmus-search-tag">language: english OR (country: mexico language: french)</span>
                </div>
                <p className="pt-0.5 text-right">Grouped conditions</p>
              </div>
            </div>
          </div>


        </div>
      </main>
    </div>
  );
}
