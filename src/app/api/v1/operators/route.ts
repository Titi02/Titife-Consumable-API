import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, methodNotAllowedResponse } from "@/lib/envelope";
import { parsePaginationParams, parseSortParams } from "@/lib/validation/common";
import { createOperatorSchema } from "@/lib/validation/operator";
import { generateId } from "@/lib/id";
import { OperatorStatus, Prisma } from "@prisma/client";

const SORT_WHITELIST = ["createdAt", "name", "code"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // 1. Pagination validation & clamping
    const pagResult = parsePaginationParams(searchParams);
    if (!pagResult.success) return pagResult.response;
    const { limit, offset } = pagResult.data;

    // 2. Sorting validation against whitelist
    const sortResult = parseSortParams(searchParams, SORT_WHITELIST, "createdAt");
    if (!sortResult.success) return sortResult.response;
    const { sort, order } = sortResult.data;

    // 3. Filters
    const statusParam = searchParams.get("status");
    const searchParam = searchParams.get("search");

    const where: Prisma.OperatorWhereInput = {};

    if (statusParam) {
      const upperStatus = statusParam.toUpperCase();
      if (Object.values(OperatorStatus).includes(upperStatus as OperatorStatus)) {
        where.status = upperStatus as OperatorStatus;
      } else {
        return errorResponse(
          "BAD_REQUEST",
          `Invalid status filter '${statusParam}'. Allowed: [ACTIVE, INACTIVE]`,
          400
        );
      }
    }

    if (searchParam) {
      where.OR = [
        { name: { contains: searchParam, mode: "insensitive" } },
        { headquarters: { contains: searchParam, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.operator.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { [sort]: order },
      }),
      prisma.operator.count({ where }),
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

    const parsed = createOperatorSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const fieldPath = firstIssue.path.join(".");
      const msg = fieldPath ? `${fieldPath}: ${firstIssue.message}` : firstIssue.message;
      return errorResponse("UNPROCESSABLE_ENTITY", msg, 422);
    }

    // Check unique constraints (name, code)
    const existingName = await prisma.operator.findUnique({ where: { name: parsed.data.name } });
    if (existingName) {
      return errorResponse("UNPROCESSABLE_ENTITY", `Operator with name '${parsed.data.name}' already exists`, 422);
    }

    const existingCode = await prisma.operator.findUnique({ where: { code: parsed.data.code } });
    if (existingCode) {
      return errorResponse("UNPROCESSABLE_ENTITY", `Operator with code '${parsed.data.code}' already exists`, 422);
    }

    const newOperator = await prisma.operator.create({
      data: {
        id: generateId("op"),
        ...parsed.data,
      },
    });

    return successResponse(newOperator, undefined, 201);
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
