import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSheetItems } from "@/lib/services/sheet-sync";
import { z } from "zod";

const QuerySchema = z.object({
  status: z.string().optional(),
  needsOwnerMapping: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  isOverdue: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  ownerEmail: z.string().optional(),
});

export async function GET(request: NextRequest) {
  // Check auth
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const params = QuerySchema.parse(Object.fromEntries(searchParams));

    const items = await getSheetItems(params);

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Sheet items API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
