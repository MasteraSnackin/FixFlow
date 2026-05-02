import { NextResponse } from "next/server";
import { startMaintenanceWorkflow } from "@/workflows/maintenance";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { requestId?: string };
    if (!body.requestId) {
      return NextResponse.json(
        { error: "requestId is required" },
        { status: 400 }
      );
    }

    const run = await startMaintenanceWorkflow(body.requestId);

    return NextResponse.json(
      {
        success: true,
        requestId: body.requestId,
        runId: run.runId,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[/api/workflows/maintenance] Failed to start workflow:", error);
    return NextResponse.json(
      {
        error: "Failed to start maintenance workflow",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

