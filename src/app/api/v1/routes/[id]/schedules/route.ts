import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, methodNotAllowedResponse } from "@/lib/envelope";
import { parsePaginationParams, parseSortParams } from "@/lib/validation/common";
import { isValidId } from "@/lib/id";
import { ScheduleStatus, Prisma } from "@prisma/client";

const SORT_WHITELIST = ["departureTime", "fareAmount", "availableSeats", "createdAt"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidId(id, "rot")) {
      return errorResponse("BAD_REQUEST", `Invalid route ID format '${id}'`, 400);
    }

    const route = await prisma.route.findUnique({ where: { id } });
    if (!route) {
      return errorResponse("NOT_FOUND", `Route with ID '${id}' not found`, 404);
    }

    const { searchParams } = new URL(req.url);

    const pagResult = parsePaginationParams(searchParams);
    if (!pagResult.success) return pagResult.response;
    const { limit, offset } = pagResult.data;

    const sortResult = parseSortParams(searchParams, SORT_WHITELIST, "departureTime");
    if (!sortResult.success) return sortResult.response;
    const { sort, order } = sortResult.data;

    const statusParam = searchParams.get("status");
    const minAvailableSeatsParam = searchParams.get("minAvailableSeats");

    const where: Prisma.ScheduleWhereInput = {
      routeId: id,
    };

    if (statusParam) {
      const upperStatus = statusParam.toUpperCase();
      if (Object.values(ScheduleStatus).includes(upperStatus as ScheduleStatus)) {
        where.status = upperStatus as ScheduleStatus;
      } else {
        return errorResponse("BAD_REQUEST", `Invalid status filter '${statusParam}'`, 400);
      }
    }

    if (minAvailableSeatsParam) {
      const minSeats = Number(minAvailableSeatsParam);
      if (!Number.isInteger(minSeats) || minSeats < 0) {
        return errorResponse("BAD_REQUEST", "Parameter 'minAvailableSeats' must be a non-negative integer", 400);
      }
      where.availableSeats = { gte: minSeats };
    }

    const [data, total] = await Promise.all([
      prisma.schedule.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { [sort]: order },
        include: {
          operator: { select: { id: true, name: true, code: true } },
          route: { select: { id: true, originCity: true, destinationCity: true } },
        },
      }),
      prisma.schedule.count({ where }),
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
