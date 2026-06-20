import { NextResponse } from "next/server";
import { Integration } from "@/types/integrations";

const mockIntegrations: Integration[] = [
  {
    id: "int_01",
    name: "Voice & AI Live Link",
    provider: "whatsapp",
    status: "connected",
    updatedAt: new Date().toISOString(),
    config: { webhookUrl: "https://api.zeeder.ai/v1/webhook" },
  },
  {
    id: "int_02",
    name: "CRM Synchronizer",
    provider: "crm",
    status: "disconnected",
    updatedAt: new Date().toISOString(),
    config: {},
  },
];

export async function GET() {
  return NextResponse.json(mockIntegrations);
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status, config } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing unique integration ID" }, { status: 400 });
    }

    const index = mockIntegrations.findIndex((item) => item.id === id);
    if (index === -1) {
      return NextResponse.json({ error: "Integration node not found" }, { status: 404 });
    }

    mockIntegrations[index] = {
      ...mockIntegrations[index],
      ...(status && { status }),
      ...(config && { config: { ...mockIntegrations[index].config, ...config } }),
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(mockIntegrations[index]);
  } catch {
    return NextResponse.json({ error: "Internal Server error during mutation" }, { status: 500 });
  }
}