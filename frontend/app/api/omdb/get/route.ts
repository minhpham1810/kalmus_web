import { NextRequest, NextResponse } from 'next/server';

const OMDB_KEY = 'cb809e74';
const OMDB_URL = 'https://www.omdbapi.com/';

export const dynamic = 'force-dynamic';

interface CachedMovie {
  imdb_id: string;
  title: string;
  year: string;
  genre: string;
  director: string;
  plot: string;
  poster_url: string;
  raw: Record<string, unknown>;
}

// In-memory cache keyed by IMDb ID. Movie details are stable so TTL is long.
const cache = new Map<string, { data: CachedMovie; expires: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX = 200;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  const cached = cache.get(id);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data);
  }

  try {
    const url = new URL(OMDB_URL);
    url.searchParams.set('apikey', OMDB_KEY);
    url.searchParams.set('i', id);
    url.searchParams.set('plot', 'full');

    const res = await fetch(url.toString());
    const json = await res.json();

    if (json.Response !== 'True') {
      return NextResponse.json(
        { error: json.Error || 'Movie not found' },
        { status: 404 }
      );
    }

    const movie: CachedMovie = {
      imdb_id: json.imdbID,
      title: json.Title,
      year: json.Year,
      genre: json.Genre || '',
      director: json.Director || '',
      plot: json.Plot || '',
      poster_url:
        json.Poster && json.Poster !== 'N/A'
          ? json.Poster.replace(/^http:/, 'https:')
          : '',
      raw: json,
    };

    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(id, { data: movie, expires: Date.now() + CACHE_TTL });

    return NextResponse.json(movie);
  } catch (error) {
    console.error('OMDb detail proxy error:', error);
    return NextResponse.json({ error: 'Lookup unavailable' }, { status: 502 });
  }
}
