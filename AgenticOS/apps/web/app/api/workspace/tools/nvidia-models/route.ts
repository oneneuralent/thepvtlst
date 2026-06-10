import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { "Authorization": `Bearer ${process.env.NVIDIA_NIM_API_KEY}` }
    });
    
    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch NVIDIA models" }, { status: response.status });
    }
    
    const data = await response.json();
    return NextResponse.json({ models: data.data || [] });
  } catch (error) {
    console.error("Failed to fetch NVIDIA models:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
