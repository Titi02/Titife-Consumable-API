import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, methodNotAllowedResponse } from "@/lib/envelope";
import { parsePaginationParams, parseSortParams } from "@/lib/validation/common";
import { isValidId } from "@/lib/id";
import { RouteStatus, Prisma } from "@prisma/client";

const SORT_WHITELIST = ["createdAt", "baseFareAmount", "distanceKm", "originCity"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidId(id, "op")) {
      return errorResponse("BAD_REQUEST", `Invalid operator ID format '${id}'`, 400);
    }

    const operator = await prisma.operator.findUnique({ where: { id } });
    if (!operator) {
      return errorResponse("NOT_FOUND", `Operator with ID '${id}' not found`, 404);
    }

    const { searchParams } = new URL(req.url);

    const pagResult = parsePaginationParams(searchParams);
    if (!pagResult.success) return pagResult.response;
    const { limit, offset } = pagResult.data;

    const sortResult = parseSortParams(searchParams, SORT_WHITELIST, "createdAt");
    if (!sortResult.success) return sortResult.response;
    const { sort, order } = sortResult.data;

    const statusParam = searchParams.get("status");
    const originStateParam = searchParams.get("originState");
    const destinationStateParam = searchParams.get("destinationState");

    const where: Prisma.RouteWhereInput = {
      operatorId: id,
    };

    if (statusParam) {
      const upperStatus = statusParam.toUpperCase();
      if (Object.values(RouteStatus).includes(upperStatus as RouteStatus)) {
        where.status = upperStatus as RouteStatus;
      } else {
        return errorResponse("BAD_REQUEST", `Invalid status filter '${statusParam}'`, 400);
      }
    }

    if (originStateParam) where.originState = { equals: originStateParam, mode: "insensitive" };
    if (destinationStateParam) where.destinationState = { equals: destinationStateParam, mode: "insensitive" };

    const [data, total] = await Promise.all([
      prisma.route.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { [sort]: order },
      }),
      prisma.route.count({ where }),
    ]);

    const hasMore = offset + data.length < total;

    return successResponse(data, { total, limit, offset, hasMore });
  } catch (err: any) {
    return errorResponse("INTERNAL_SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

export async function POST() {
  return methodNotAllowedResponse(["GET"]);
}

export async function PUT() {
  return methodNotAllowedResponse(["GET"]);
}

export async function DELETE() {
  return methodNotAllowedResponse(["GET"]);
}

export async function PATCH() {
  return methodNotAllowedResponse(["GET"]);
}
