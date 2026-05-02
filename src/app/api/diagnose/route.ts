import { NextResponse } from "next/server";
import { runDiagnosis } from "@/lib/ai/diagnose";
import type { DiagnoseRequest, DiagnoseResponse, ApiError } from "@/lib/api-types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DiagnoseRequest;

    if (!body.requestId) {
      return NextResponse.json(
        { error: "requestId is required" } satisfies ApiError,
        { status: 400 }
      );
    }

    const diagnosis = await runDiagnosis(body.requestId);

    return NextResponse.json({ diagnosis } satisfies DiagnoseResponse);
  } catch (error) {
    console.error("[/api/diagnose] Error:", error);
    return NextResponse.json(
      {
        error: "Diagnosis failed",
        details: error instanceof Error ? error.message : String(error),
      } satisfies ApiError,
      { status: 500 }
    );
  }
}
