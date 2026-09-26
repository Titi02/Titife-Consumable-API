import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "./config/rateLimit";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Only apply rate limiting to API routes under /api/
  if (path.startsWith("/api/")) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    const rateCheck = await checkRateLimit(ip);

    if (!rateCheck.success) {
      return NextResponse.json(
        {
          error: {
            code: "TOO_MANY_REQUESTS",
            message: "Rate limit threshold exceeded. Please try again later.",
          },
        },
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": rateCheck.resetSeconds.toString(),
            "X-RateLimit-Limit": rateCheck.limit.toString(),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", rateCheck.limit.toString());
    response.headers.set("X-RateLimit-Remaining", rateCheck.remaining.toString());
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
  runtime: "nodejs",
};
