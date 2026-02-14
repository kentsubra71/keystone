import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sheetItems } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get sample items
    const items = await db
      .select()
      .from(sheetItems)
      .limit(10);

    // Get unique owner labels
    const ownerLabels = await db
      .selectDistinct({ ownerLabel: sheetItems.ownerLabel })
      .from(sheetItems)
      .where(sql`${sheetItems.ownerLabel} IS NOT NULL`)
      .limit(50);

    // Get counts
    const [stats] = await db
      .select({
        total: sql<number>`count(*)`,
        withOwnerEmail: sql<number>`count(case when ${sheetItems.ownerEmail} is not null then 1 end)`,
        needsMapping: sql<number>`count(case when ${sheetItems.needsOwnerMapping} = true then 1 end)`,
      })
      .from(sheetItems);

    return NextResponse.json({
      stats,
      uniqueOwnerLabels: ownerLabels.map((o) => o.ownerLabel),
      sampleItems: items.map((item) => ({
        commitment: item.commitment?.substring(0, 50),
        ownerLabel: item.ownerLabel,
        ownerEmail: item.ownerEmail,
        status: item.status,
        needsOwnerMapping: item.needsOwnerMapping,
      })),
    });
  } catch (error) {
    console.error("Debug error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
