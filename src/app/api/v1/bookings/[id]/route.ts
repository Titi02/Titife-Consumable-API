import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, methodNotAllowedResponse } from "@/lib/envelope";
import { updateBookingSchema } from "@/lib/validation/booking";
import { isValidId } from "@/lib/id";
import { BookingStatus } from "@prisma/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidId(id, "bkg")) {
      return errorResponse("BAD_REQUEST", `Invalid booking ID format '${id}'`, 400);
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        schedule: {
          select: {
            id: true,
            departureTime: true,
            busRegistrationNumber: true,
            busModel: true,
            operator: { select: { id: true, name: true, code: true, supportPhone: true } },
            route: { select: { originState: true, originCity: true, destinationState: true, destinationCity: true } },
          },
        },
      },
    });

    if (!booking) {
      return errorResponse("NOT_FOUND", `Booking with ID '${id}' not found`, 404);
    }

    return successResponse(booking);
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

    if (!isValidId(id, "bkg")) {
      return errorResponse("BAD_REQUEST", `Invalid booking ID format '${id}'`, 400);
    }

    const existing = await prisma.booking.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("NOT_FOUND", `Booking with ID '${id}' not found`, 404);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return errorResponse("BAD_REQUEST", "Invalid JSON payload", 400);
    }

    const parsed = updateBookingSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const fieldPath = firstIssue.path.join(".");
      const msg = fieldPath ? `${fieldPath}: ${firstIssue.message}` : firstIssue.message;
      return errorResponse("UNPROCESSABLE_ENTITY", msg, 422);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // If status is transitioning from CONFIRMED -> CANCELLED, increment availableSeats back
      if (parsed.data.status === BookingStatus.CANCELLED && existing.status === BookingStatus.CONFIRMED) {
        await tx.schedule.update({
          where: { id: existing.scheduleId },
          data: { availableSeats: { increment: 1 } },
        });
      }

      return tx.booking.update({
        where: { id },
        data: parsed.data,
        include: {
          schedule: {
            select: {
              id: true,
              departureTime: true,
              operator: { select: { name: true, code: true } },
              route: { select: { originCity: true, destinationCity: true } },
            },
          },
        },
      });
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
