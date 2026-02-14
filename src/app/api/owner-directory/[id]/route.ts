import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ownerDirectory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const UpdateOwnerSchema = z.object({
  displayName: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

type RouteParams = {
  params: Promise<{ id: string }>;
};

// PUT - Update owner mapping
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateOwnerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const [owner] = await db
      .update(ownerDirectory)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(ownerDirectory.id, id))
      .returning();

    if (!owner) {
      return NextResponse.json({ error: "Owner not found" }, { status: 404 });
    }

    return NextResponse.json({ owner });
  } catch (error) {
    console.error("Owner directory PUT error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Remove owner mapping
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const [deleted] = await db
      .delete(ownerDirectory)
      .where(eq(ownerDirectory.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Owner not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Owner directory DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
