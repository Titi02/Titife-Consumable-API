import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, methodNotAllowedResponse } from "@/lib/envelope";
import { parsePaginationParams, parseSortParams } from "@/lib/validation/common";
import { createBookingSchema } from "@/lib/validation/booking";
import { generateId } from "@/lib/id";
import { BookingStatus, Prisma } from "@prisma/client";

const SORT_WHITELIST = ["createdAt", "seatNumber", "totalAmount"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const pagResult = parsePaginationParams(searchParams);
    if (!pagResult.success) return pagResult.response;
    const { limit, offset } = pagResult.data;

    const sortResult = parseSortParams(searchParams, SORT_WHITELIST, "createdAt");
    if (!sortResult.success) return sortResult.response;
    const { sort, order } = sortResult.data;

    const scheduleId = searchParams.get("scheduleId");
    const statusParam = searchParams.get("status");
    const searchParam = searchParams.get("search");

    const where: Prisma.BookingWhereInput = {};

    if (scheduleId) where.scheduleId = scheduleId;

    if (statusParam) {
      const upperStatus = statusParam.toUpperCase();
      if (Object.values(BookingStatus).includes(upperStatus as BookingStatus)) {
        where.status = upperStatus as BookingStatus;
      } else {
        return errorResponse("BAD_REQUEST", `Invalid status filter '${statusParam}'. Allowed: [CONFIRMED, CANCELLED]`, 400);
      }
    }

    if (searchParam) {
      where.OR = [
        { passengerName: { contains: searchParam, mode: "insensitive" } },
        { passengerPhone: { contains: searchParam, mode: "insensitive" } },
        { bookingReference: { contains: searchParam, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { [sort]: order },
        include: {
          schedule: {
            select: {
              id: true,
              departureTime: true,
              busModel: true,
              operator: { select: { name: true, code: true } },
              route: { select: { originCity: true, destinationCity: true } },
            },
          },
        },
      }),
      prisma.booking.count({ where }),
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

    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const fieldPath = firstIssue.path.join(".");
      const msg = fieldPath ? `${fieldPath}: ${firstIssue.message}` : firstIssue.message;
      return errorResponse("UNPROCESSABLE_ENTITY", msg, 422);
    }

    const { scheduleId, passengerName, passengerPhone, passengerEmail, seatNumber: requestedSeat } = parsed.data;

    // Run atomic seat decrement and booking creation inside a transaction
    try {
      const newBooking = await prisma.$transaction(async (tx) => {
        const schedule = await tx.schedule.findUnique({
          where: { id: scheduleId },
        });

        if (!schedule) {
          throw { status: 422, message: `Schedule with ID '${scheduleId}' does not exist` };
        }

        if (schedule.availableSeats <= 0) {
          throw { status: 422, message: `No available seats for schedule '${scheduleId}'` };
        }

        const allocatedSeat = requestedSeat ?? (schedule.totalSeats - schedule.availableSeats + 1);

        if (allocatedSeat > schedule.totalSeats) {
          throw { status: 422, message: `Requested seat number ${allocatedSeat} exceeds bus capacity (${schedule.totalSeats})` };
        }

        // Decrement available seats safely
        await tx.schedule.update({
          where: { id: scheduleId },
          data: { availableSeats: { decrement: 1 } },
        });

        const bookingRef = `NG-BUS-${Math.floor(100000 + Math.random() * 900000)}`;

        const created = await tx.booking.create({
          data: {
            id: generateId("bkg"),
            scheduleId,
            passengerName,
            passengerPhone,
            passengerEmail,
            seatNumber: allocatedSeat,
            totalAmount: schedule.fareAmount,
            currency: "NGN",
            bookingReference: bookingRef,
            status: BookingStatus.CONFIRMED,
          },
          include: {
            schedule: {
              select: {
                id: true,
                departureTime: true,
                busModel: true,
                operator: { select: { name: true, code: true } },
                route: { select: { originCity: true, destinationCity: true } },
              },
            },
          },
        });

        return created;
      });

      return successResponse(newBooking, undefined, 201);
    } catch (txErr: any) {
      if (txErr && txErr.status && txErr.message) {
        return errorResponse("UNPROCESSABLE_ENTITY", txErr.message, txErr.status);
      }
      throw txErr;
    }
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
