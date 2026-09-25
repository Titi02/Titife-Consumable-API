import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, methodNotAllowedResponse } from "@/lib/envelope";
import { updateRouteSchema } from "@/lib/validation/route";
import { isValidId } from "@/lib/id";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidId(id, "rot")) {
      return errorResponse("BAD_REQUEST", `Invalid route ID format '${id}'`, 400);
    }

    const route = await prisma.route.findUnique({
      where: { id },
      include: {
        operator: {
          select: { id: true, name: true, code: true, headquarters: true },
        },
        _count: {
          select: { schedules: true },
        },
      },
    });

    if (!route) {
      return errorResponse("NOT_FOUND", `Route with ID '${id}' not found`, 404);
    }

    return successResponse(route);
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

    if (!isValidId(id, "rot")) {
      return errorResponse("BAD_REQUEST", `Invalid route ID format '${id}'`, 400);
    }

    const existing = await prisma.route.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("NOT_FOUND", `Route with ID '${id}' not found`, 404);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return errorResponse("BAD_REQUEST", "Invalid JSON payload", 400);
    }

    const parsed = updateRouteSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const fieldPath = firstIssue.path.join(".");
      const msg = fieldPath ? `${fieldPath}: ${firstIssue.message}` : firstIssue.message;
      return errorResponse("UNPROCESSABLE_ENTITY", msg, 422);
    }

    const updated = await prisma.route.update({
      where: { id },
      data: parsed.data,
      include: {
        operator: {
          select: { id: true, name: true, code: true },
        },
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
