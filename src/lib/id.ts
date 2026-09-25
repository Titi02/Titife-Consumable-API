import { createId } from "@paralleldrive/cuid2";

export type IdPrefix = "op" | "rot" | "sch" | "bkg";

/**
 * Generate custom non-sequential prefixed string IDs (e.g., op_cm7..., rot_cm7..., sch_cm7..., bkg_cm7...)
 */
export function generateId(prefix: IdPrefix): string {
  return `${prefix}_${createId()}`;
}

/**
 * Validates if an ID matches the expected prefix format.
 */
export function isValidId(id: string, prefix: IdPrefix): boolean {
  if (typeof id !== "string") return false;
  const regex = new RegExp(`^${prefix}_[a-z0-9]+$`);
  return regex.test(id);
}
