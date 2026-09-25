import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, methodNotAllowedResponse } from "@/lib/envelope";
import { updateScheduleSchema } from "@/lib/validation/schedule";
import { isValidId } from "@/lib/id";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidId(id, "sch")) {
      return errorResponse("BAD_REQUEST", `Invalid schedule ID format '${id}'`, 400);
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: {
        operator: { select: { id: true, name: true, code: true, supportPhone: true } },
        route: { select: { id: true, originState: true, originCity: true, destinationState: true, destinationCity: true, distanceKm: true } },
        _count: { select: { bookings: true } },
      },
    });

    if (!schedule) {
      return errorResponse("NOT_FOUND", `Schedule with ID '${id}' not found`, 404);
    }

    return successResponse(schedule);
  } catch (err: any) {
    return errorResponse("INTERNAL_SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidId(id, "sch")) {
      return errorResponse("BAD_REQUEST", `Invalid schedule ID format '${id}'`, 400);
    }

    const existing = await prisma.schedule.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("NOT_FOUND", `Schedule with ID '${id}' not found`, 404);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return errorResponse("BAD_REQUEST", "Invalid JSON payload", 400);
    }

    const parsed = updateScheduleSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const fieldPath = firstIssue.path.join(".");
      const msg = fieldPath ? `${fieldPath}: ${firstIssue.message}` : firstIssue.message;
      return errorResponse("UNPROCESSABLE_ENTITY", msg, 422);
    }

    const updateData: any = { ...parsed.data };
    if (parsed.data.departureTime) updateData.departureTime = new Date(parsed.data.departureTime);
    if (parsed.data.arrivalTime) updateData.arrivalTime = new Date(parsed.data.arrivalTime);

    const updated = await prisma.schedule.update({
      where: { id },
      data: updateData,
      include: {
        operator: { select: { id: true, name: true, code: true } },
        route: { select: { id: true, originCity: true, destinationCity: true } },
      },
    });

    return successResponse(updated);
  } catch (err: any) {
    return errorResponse("INTERNAL_SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

export async function POST() {
  return methodNotAllowedResponse(["GET", "PATCH"]);
}

export async function PUT() {
  return methodNotAllowedResponse(["GET", "PATCH"]);
}

export async function DELETE() {
  return methodNotAllowedResponse(["GET", "PATCH"]);
}
