import { errorResponse } from "@/lib/envelope";

export async function GET() {
  return errorResponse("NOT_FOUND", "Route not found", 404);
}

export async function POST() {
  return errorResponse("NOT_FOUND", "Route not found", 404);
}

export async function PUT() {
  return errorResponse("NOT_FOUND", "Route not found", 404);
}

export async function DELETE() {
  return errorResponse("NOT_FOUND", "Route not found", 404);
}

export async function PATCH() {
  return errorResponse("NOT_FOUND", "Route not found", 404);
}

export async function OPTIONS() {
  return errorResponse("NOT_FOUND", "Route not found", 404);
}

export async function HEAD() {
  return errorResponse("NOT_FOUND", "Route not found", 404);
}
