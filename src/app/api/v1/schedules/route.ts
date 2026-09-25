import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, methodNotAllowedResponse } from "@/lib/envelope";
import { parsePaginationParams, parseSortParams } from "@/lib/validation/common";
import { createScheduleSchema } from "@/lib/validation/schedule";
import { generateId } from "@/lib/id";
import { ScheduleStatus, Prisma } from "@prisma/client";

const SORT_WHITELIST = ["departureTime", "fareAmount", "availableSeats", "createdAt"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const pagResult = parsePaginationParams(searchParams);
    if (!pagResult.success) return pagResult.response;
    const { limit, offset } = pagResult.data;

    const sortResult = parseSortParams(searchParams, SORT_WHITELIST, "departureTime");
    if (!sortResult.success) return sortResult.response;
    const { sort, order } = sortResult.data;

    const routeId = searchParams.get("routeId");
    const operatorId = searchParams.get("operatorId");
    const statusParam = searchParams.get("status");
    const departureDateParam = searchParams.get("departureDate");
    const minAvailableSeatsParam = searchParams.get("minAvailableSeats");

    const where: Prisma.ScheduleWhereInput = {};

    if (routeId) where.routeId = routeId;
    if (operatorId) where.operatorId = operatorId;

    if (statusParam) {
      const upperStatus = statusParam.toUpperCase();
      if (Object.values(ScheduleStatus).includes(upperStatus as ScheduleStatus)) {
        where.status = upperStatus as ScheduleStatus;
      } else {
        return errorResponse("BAD_REQUEST", `Invalid status filter '${statusParam}'. Allowed: [SCHEDULED, BOARDING, COMPLETED, CANCELLED]`, 400);
      }
    }

    if (departureDateParam) {
      // Expect YYYY-MM-DD format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(departureDateParam)) {
        return errorResponse("BAD_REQUEST", "Parameter 'departureDate' must be in YYYY-MM-DD format", 400);
      }
      const startDate = new Date(`${departureDateParam}T00:00:00.000Z`);
      const endDate = new Date(`${departureDateParam}T23:59:59.999Z`);
      where.departureTime = { gte: startDate, lte: endDate };
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
          route: { select: { id: true, originState: true, originCity: true, destinationState: true, destinationCity: true } },
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

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return errorResponse("BAD_REQUEST", "Invalid JSON payload", 400);
    }

    const parsed = createScheduleSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const fieldPath = firstIssue.path.join(".");
      const msg = fieldPath ? `${fieldPath}: ${firstIssue.message}` : firstIssue.message;
      return errorResponse("UNPROCESSABLE_ENTITY", msg, 422);
    }

    // Verify route and operator exist
    const route = await prisma.route.findUnique({ where: { id: parsed.data.routeId } });
    if (!route) {
      return errorResponse("UNPROCESSABLE_ENTITY", `Route with ID '${parsed.data.routeId}' does not exist`, 422);
    }

    const operator = await prisma.operator.findUnique({ where: { id: parsed.data.operatorId } });
    if (!operator) {
      return errorResponse("UNPROCESSABLE_ENTITY", `Operator with ID '${parsed.data.operatorId}' does not exist`, 422);
    }

    const availableSeats = parsed.data.availableSeats ?? parsed.data.totalSeats;

    const newSchedule = await prisma.schedule.create({
      data: {
        id: generateId("sch"),
        routeId: parsed.data.routeId,
        operatorId: parsed.data.operatorId,
        busRegistrationNumber: parsed.data.busRegistrationNumber,
        busModel: parsed.data.busModel,
        totalSeats: parsed.data.totalSeats,
        availableSeats,
        departureTime: new Date(parsed.data.departureTime),
        arrivalTime: new Date(parsed.data.arrivalTime),
        fareAmount: parsed.data.fareAmount,
        currency: parsed.data.currency,
        status: parsed.data.status,
      },
      include: {
        operator: { select: { id: true, name: true, code: true } },
        route: { select: { id: true, originCity: true, destinationCity: true } },
      },
    });

    return successResponse(newSchedule, undefined, 201);
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
