import { z } from "zod";
import { OperatorStatus } from "@prisma/client";

export const createOperatorSchema = z.object({
  name: z.string({ required_error: "name is required" }).min(2, "name must be at least 2 characters"),
  code: z
    .string({ required_error: "code is required" })
    .min(2, "code must be at least 2 characters")
    .max(10, "code must be at most 10 characters")
    .toUpperCase(),
  headquarters: z.string({ required_error: "headquarters is required" }).min(2, "headquarters is required"),
  supportEmail: z.string({ required_error: "supportEmail is required" }).email("supportEmail must be a valid email"),
  supportPhone: z.string({ required_error: "supportPhone is required" }).min(5, "supportPhone must be valid"),
  status: z.nativeEnum(OperatorStatus).optional().default(OperatorStatus.ACTIVE),
});

export const updateOperatorSchema = createOperatorSchema.partial();
