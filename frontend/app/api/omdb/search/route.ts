import { NextRequest, NextResponse } from 'next/server';


const OMDB_URL = 'https://www.omdbapi.com/';

export const dynamic = 'force-dynamic';

interface SearchResult {
  imdbID: string;
  Title: string;
  Year: string;
  Poster: string;
}

// In-memory cache keyed by search query. FIFO eviction at CACHE_MAX.
const cache = new Map<string, { data: { results: SearchResult[] }; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX = 100;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q');
  if (!q || !q.trim()) {
    return NextResponse.json({ results: [] });
  }

  const query = q.trim();

  const cached = cache.get(query);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data);
  }

  try {
    const url = new URL(OMDB_URL);
    url.searchParams.set('apikey', OMDB_KEY);
    url.searchParams.set('s', query);
    url.searchParams.set('type', 'movie');

    const res = await fetch(url.toString());
    const json = await res.json();

    const results: SearchResult[] =
      json.Response === 'True'
        ? (json.Search || []).map((item: Record<string, string>) => ({
            imdbID: item.imdbID,
            Title: item.Title,
            Year: item.Year,
            Poster:
              item.Poster && item.Poster !== 'N/A'
                ? item.Poster.replace(/^http:/, 'https:')
                : '',
          }))
        : [];

    const payload = { results };

    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(query, { data: payload, expires: Date.now() + CACHE_TTL });

    return NextResponse.json(payload);
  } catch (error) {
    console.error('OMDb search proxy error:', error);
    return NextResponse.json({ error: 'Search unavailable' }, { status: 502 });
  }
}
