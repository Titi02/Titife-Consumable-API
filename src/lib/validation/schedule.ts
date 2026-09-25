import { z } from "zod";
import { ScheduleStatus } from "@prisma/client";

export const createScheduleSchema = z.object({
  routeId: z.string({ required_error: "routeId is required" }),
  operatorId: z.string({ required_error: "operatorId is required" }),
  busRegistrationNumber: z.string({ required_error: "busRegistrationNumber is required" }).min(3),
  busModel: z.string({ required_error: "busModel is required" }).min(2),
  totalSeats: z.number({ required_error: "totalSeats is required" }).int().positive(),
  availableSeats: z.number().int().nonnegative().optional(),
  departureTime: z.string({ required_error: "departureTime is required" }).datetime({ message: "departureTime must be a valid ISO-8601 date string" }),
  arrivalTime: z.string({ required_error: "arrivalTime is required" }).datetime({ message: "arrivalTime must be a valid ISO-8601 date string" }),
  fareAmount: z.number({ required_error: "fareAmount is required" }).int().nonnegative(),
  currency: z.string().optional().default("NGN"),
  status: z.nativeEnum(ScheduleStatus).optional().default(ScheduleStatus.SCHEDULED),
});

export const updateScheduleSchema = createScheduleSchema.partial();
