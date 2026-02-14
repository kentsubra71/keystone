import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ownerDirectory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const CreateOwnerSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  email: z.string().email("Valid email is required"),
});

// GET - List all owner mappings
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const owners = await db.select().from(ownerDirectory);
    return NextResponse.json({ owners });
  } catch (error) {
    console.error("Owner directory GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Add new owner mapping
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = CreateOwnerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const [owner] = await db
      .insert(ownerDirectory)
      .values({
        displayName: parsed.data.displayName,
        email: parsed.data.email,
      })
      .returning();

    return NextResponse.json({ owner }, { status: 201 });
  } catch (error) {
    console.error("Owner directory POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
