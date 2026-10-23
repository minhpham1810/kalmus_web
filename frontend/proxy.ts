import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdmin } from "@/lib/db";

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  // Extract user ID from the x-username header
  // Contains just the username before the @bucknell.edu
  const user = request.headers.get("x-username");

  if (!user) {
    return new NextResponse("401 Unauthorized: SSO header missing.", {
      status: 401,
    });
  }

  // Ensure all lowercase
  const username = user.toLowerCase();

  // Verify username against the admin database, denying access if it can't be read
  let allowed: boolean;
  try {
    allowed = isAdmin(username);
  } catch (error) {
    console.error("Admin database unavailable:", error);
    return new NextResponse(
      "500 Internal Server Error: Admin list unavailable.",
      {
        status: 500,
      },
    );
  }

  if (!allowed) {
    return new NextResponse("403 Forbidden: You do not have admin access.", {
      status: 403,
    });
  }

  // Allow request to proceed to route
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    // editing and cancelling
    "/api/edit-film/:path*",
    "/api/job/:path*",
    // uploading and generating barcodes
    "/upload/:path*",
    "/api/upload-chunk/:path*",
    "/api/assemble-file/:path*",
    "/api/generate-barcode/:path*",
  ],
};
