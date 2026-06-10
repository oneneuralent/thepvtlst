import { NextResponse } from "next/server";
import { modelPresets } from "@/lib/server/model-presets";

export async function GET() {
  return NextResponse.json({ presets: modelPresets });
}
