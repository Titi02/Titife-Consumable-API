import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, methodNotAllowedResponse } from "@/lib/envelope";
import { updateOperatorSchema } from "@/lib/validation/operator";
import { isValidId } from "@/lib/id";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidId(id, "op")) {
      return errorResponse("BAD_REQUEST", `Invalid operator ID format '${id}'`, 400);
    }

    const operator = await prisma.operator.findUnique({
      where: { id },
      include: {
        _count: {
          select: { routes: true, schedules: true },
        },
      },
    });

    if (!operator) {
      return errorResponse("NOT_FOUND", `Operator with ID '${id}' not found`, 404);
    }

    return successResponse(operator);
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

    if (!isValidId(id, "op")) {
      return errorResponse("BAD_REQUEST", `Invalid operator ID format '${id}'`, 400);
    }

    const existing = await prisma.operator.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("NOT_FOUND", `Operator with ID '${id}' not found`, 404);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return errorResponse("BAD_REQUEST", "Invalid JSON payload", 400);
    }

    const parsed = updateOperatorSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const fieldPath = firstIssue.path.join(".");
      const msg = fieldPath ? `${fieldPath}: ${firstIssue.message}` : firstIssue.message;
      return errorResponse("UNPROCESSABLE_ENTITY", msg, 422);
    }

    const updated = await prisma.operator.update({
      where: { id },
      data: parsed.data,
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
