import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, methodNotAllowedResponse } from "@/lib/envelope";
import { parsePaginationParams, parseSortParams } from "@/lib/validation/common";
import { createRouteSchema } from "@/lib/validation/route";
import { generateId, isValidId } from "@/lib/id";
import { RouteStatus, Prisma } from "@prisma/client";

const SORT_WHITELIST = ["createdAt", "baseFareAmount", "distanceKm", "originCity"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const pagResult = parsePaginationParams(searchParams);
    if (!pagResult.success) return pagResult.response;
    const { limit, offset } = pagResult.data;

    const sortResult = parseSortParams(searchParams, SORT_WHITELIST, "createdAt");
    if (!sortResult.success) return sortResult.response;
    const { sort, order } = sortResult.data;

    const originState = searchParams.get("originState");
    const destinationState = searchParams.get("destinationState");
    const statusParam = searchParams.get("status");
    const operatorId = searchParams.get("operatorId");

    const where: Prisma.RouteWhereInput = {};

    if (originState) where.originState = { equals: originState, mode: "insensitive" };
    if (destinationState) where.destinationState = { equals: destinationState, mode: "insensitive" };
    if (operatorId) where.operatorId = operatorId;

    if (statusParam) {
      const upperStatus = statusParam.toUpperCase();
      if (Object.values(RouteStatus).includes(upperStatus as RouteStatus)) {
        where.status = upperStatus as RouteStatus;
      } else {
        return errorResponse("BAD_REQUEST", `Invalid status filter '${statusParam}'. Allowed: [ACTIVE, SUSPENDED]`, 400);
      }
    }

    const [data, total] = await Promise.all([
      prisma.route.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { [sort]: order },
        include: {
          operator: {
            select: { id: true, name: true, code: true },
          },
        },
      }),
      prisma.route.count({ where }),
    ]);

    const hasMore = offset + data.length < total;

    return successResponse(data, { total, limit, offset, hasMore });
  } catch (err: any) {
    return errorResponse("INTERNAL_SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return errorResponse("BAD_REQUEST", "Invalid JSON payload", 400);
    }

    const parsed = createRouteSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const fieldPath = firstIssue.path.join(".");
      const msg = fieldPath ? `${fieldPath}: ${firstIssue.message}` : firstIssue.message;
      return errorResponse("UNPROCESSABLE_ENTITY", msg, 422);
    }

    // Verify operator exists
    const operator = await prisma.operator.findUnique({ where: { id: parsed.data.operatorId } });
    if (!operator) {
      return errorResponse("UNPROCESSABLE_ENTITY", `Operator with ID '${parsed.data.operatorId}' does not exist`, 422);
    }

    const newRoute = await prisma.route.create({
      data: {
        id: generateId("rot"),
        ...parsed.data,
      },
      include: {
        operator: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return successResponse(newRoute, undefined, 201);
  } catch (err: any) {
    return errorResponse("INTERNAL_SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

export async function PUT() {
  return methodNotAllowedResponse(["GET", "POST"]);
}

export async function DELETE() {
  return methodNotAllowedResponse(["GET", "POST"]);
}

export async function PATCH() {
  return methodNotAllowedResponse(["GET", "POST"]);
}
