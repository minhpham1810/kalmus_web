import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDb } from './lib/db';


export function proxy(request: NextRequest) {
  // Extract user ID from the x-username header
  // Contains just the username before the @bucknell.edu
  const user = request.headers.get('x-username')
               || (process.env.NODE_ENV !== 'production' ? 'efaden' : null);

  if (!user) {
    return new NextResponse('401 Unauthorized: SSO header missing.', { status: 401 });
  }

  // Ensure all lowercase
  const username = user.toLowerCase();

  // Verify username against allowed admins
  const admin = withDb((db) =>
    db
      .prepare(
        `SELECT 1 FROM admins WHERE username = ? LIMIT 1`,
      )
      .get(username)
      .fetchone()
  );
  if (!admin) {
    return new NextResponse('403 Forbidden: You do not have admin access.', { status: 403 });
  }

  // Allow request to proceed to route
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
