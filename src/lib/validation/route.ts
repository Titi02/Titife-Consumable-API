import { z } from "zod";
import { RouteStatus } from "@prisma/client";

export const createRouteSchema = z.object({
  operatorId: z.string({ required_error: "operatorId is required" }),
  originState: z.string({ required_error: "originState is required" }).min(2),
  originCity: z.string({ required_error: "originCity is required" }).min(2),
  destinationState: z.string({ required_error: "destinationState is required" }).min(2),
  destinationCity: z.string({ required_error: "destinationCity is required" }).min(2),
  distanceKm: z.number({ required_error: "distanceKm is required" }).int().positive(),
  estimatedMinutes: z.number({ required_error: "estimatedMinutes is required" }).int().positive(),
  baseFareAmount: z.number({ required_error: "baseFareAmount is required" }).int().nonnegative("baseFareAmount in kobo must be non-negative"),
  currency: z.string().optional().default("NGN"),
  status: z.nativeEnum(RouteStatus).optional().default(RouteStatus.ACTIVE),
});

export const updateRouteSchema = createRouteSchema.partial();
