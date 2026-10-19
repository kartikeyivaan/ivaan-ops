import { NextResponse } from "next/server";
import { mapDocGenCompanySessionError } from "@/lib/company-scope";

export function docGenJsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export function mapDocGenRouteError(error: unknown): NextResponse | null {
  const scope = mapDocGenCompanySessionError(error);
  if (scope) {
    return NextResponse.json({ message: scope.message, code: scope.code }, { status: scope.status });
  }
  if (!(error instanceof Error)) return null;
  if (error.message === "NOT_FOUND") {
    return docGenJsonError("Not found.", 404);
  }
  if (error.message === "DUPLICATE_FIELD_KEY") {
    return docGenJsonError("A field with this key already exists.", 409);
  }
  if (error.message.startsWith("VALIDATION:")) {
    return docGenJsonError(error.message.slice("VALIDATION:".length), 400);
  }
  if (error.message === "DRAFT_NOT_FOUND") {
    return docGenJsonError("No editable draft version found for this template.", 404);
  }
  if (error.message === "EMPTY_FILE") {
    return docGenJsonError("Uploaded file is empty.", 400);
  }
  if (error.message === "FILE_TOO_LARGE") {
    return docGenJsonError("PDF exceeds the maximum upload size.", 400);
  }
  if (error.message === "INVALID_PDF") {
    return docGenJsonError("Only valid PDF files are accepted.", 400);
  }
  if (error.message === "VALIDATION_ISSUES") {
    const issues = (error as Error & { issues?: unknown }).issues;
    return NextResponse.json({ message: "Template validation failed.", issues }, { status: 400 });
  }
  if (error.message === "SET_VALIDATION_ISSUES") {
    const issues = (error as Error & { issues?: unknown }).issues;
    return NextResponse.json({ message: "Document set validation failed.", issues }, { status: 400 });
  }
  if (error.message === "FIELD_VALIDATION") {
    const issues = (error as Error & { issues?: unknown }).issues;
    return NextResponse.json({ message: "Field validation failed.", issues }, { status: 400 });
  }
  return null;
}
