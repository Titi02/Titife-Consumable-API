import { NextResponse } from "next/server";

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export type ErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "UNPROCESSABLE_ENTITY"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_SERVER_ERROR";

/**
 * Construct a standardized success response envelope.
 */
export function successResponse<T>(
  data: T,
  meta?: PaginationMeta,
  status: number = 200,
  headers?: Record<string, string>
) {
  const body = meta !== undefined ? { data, meta } : { data };
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

/**
 * Construct a standardized error response envelope.
 */
export function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  headers?: Record<string, string>
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    }
  );
}

/**
 * Standard method not allowed error builder with Allow header.
 */
export function methodNotAllowedResponse(allowedMethods: string[]) {
  const allowHeader = allowedMethods.join(", ");
  return errorResponse(
    "METHOD_NOT_ALLOWED",
    `Method not allowed. Allowed methods: ${allowHeader}`,
    405,
    { Allow: allowHeader }
  );
}
