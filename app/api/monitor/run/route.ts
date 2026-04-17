import { NextRequest, NextResponse } from "next/server";
import { runMonitoringJob } from "@/lib/monitor-worker";

// POST /api/monitor/run — manually trigger the monitoring job
// Body: { limit?: number } — optional limit for testing (e.g. first 200 products)
export async function POST(req: NextRequest) {
  try {
    let body: { limit?: number } = {};
    try {
      body = await req.json();
    } catch {
      // no body, run all
    }

    const result = await runMonitoringJob({ limit: body.limit });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

// Long-running, no caching
export const maxDuration = 300;
