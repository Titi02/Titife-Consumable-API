import { z } from "zod";
import { errorResponse } from "../envelope";
import { NextResponse } from "next/server";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface ParsedPagination {
  limit: number;
  offset: number;
}

/**
 * Parses and validates limit & offset query parameters.
 * - limit default: 20, max: 100. Clamps values > 100 to 100.
 * - limit <= 0 or non-integer returns 400 error response.
 * - offset default: 0. Negative offset or non-integer returns 400 error response.
 */
export function parsePaginationParams(searchParams: URLSearchParams):
  | { success: true; data: ParsedPagination }
  | { success: false; response: NextResponse } {
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");

  let limit = DEFAULT_LIMIT;
  let offset = 0;

  if (limitRaw !== null) {
    const parsedLimit = Number(limitRaw);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      return {
        success: false,
        response: errorResponse(
          "BAD_REQUEST",
          "Parameter 'limit' must be a positive integer",
          400
        ),
      };
    }
    // Clamp to maximum allowed limit (100)
    limit = Math.min(parsedLimit, MAX_LIMIT);
  }

  if (offsetRaw !== null) {
    const parsedOffset = Number(offsetRaw);
    if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
      return {
        success: false,
        response: errorResponse(
          "BAD_REQUEST",
          "Parameter 'offset' must be a non-negative integer",
          400
        ),
      };
    }
    offset = parsedOffset;
  }

  return {
    success: true,
    data: { limit, offset },
  };
}

/**
 * Validates sorting parameters against a whitelist of allowed fields.
 */
export function parseSortParams(
  searchParams: URLSearchParams,
  allowedFields: string[],
  defaultSortField: string = "createdAt"
):
  | { success: true; data: { sort: string; order: "asc" | "desc" } }
  | { success: false; response: NextResponse } {
  const sortRaw = searchParams.get("sort");
  const orderRaw = searchParams.get("order");

  const sort = sortRaw || defaultSortField;
  const order = (orderRaw || "asc").toLowerCase();

  if (!allowedFields.includes(sort)) {
    return {
      success: false,
      response: errorResponse(
        "BAD_REQUEST",
        `Invalid sort field '${sort}'. Allowed fields: [${allowedFields.join(", ")}]`,
        400
      ),
    };
  }

  if (order !== "asc" && order !== "desc") {
    return {
      success: false,
      response: errorResponse(
        "BAD_REQUEST",
        "Parameter 'order' must be either 'asc' or 'desc'",
        400
      ),
    };
  }

  return {
    success: true,
    data: { sort, order: order as "asc" | "desc" },
  };
}
