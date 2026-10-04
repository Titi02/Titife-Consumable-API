import { z } from "zod";
import { BookingStatus } from "@prisma/client";

export const createBookingSchema = z.object({
  scheduleId: z.string({ required_error: "scheduleId is required" }).trim().min(1, "scheduleId is required"),
  passengerName: z.string({ required_error: "passengerName is required" }).min(2, "passengerName is required"),
  passengerPhone: z.string({ required_error: "passengerPhone is required" }).min(5, "passengerPhone is required"),
  passengerEmail: z.string({ required_error: "passengerEmail is required" }).email("passengerEmail must be a valid email"),
  seatNumber: z.number().int().positive().optional(),
});

export const updateBookingSchema = z.object({
  status: z.nativeEnum(BookingStatus).optional(),
  passengerName: z.string().min(2).optional(),
  passengerPhone: z.string().min(5).optional(),
  passengerEmail: z.string().email().optional(),
});
