import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, toErrorResponse } from "@/lib/authorize";
import { escapeHtml, isEmailConfigured, sendEmailBatch } from "@/lib/email";

export const dynamic = "force-dynamic";


const outreachSchema = z
  .object({
    audience: z.enum(["ALL", "COUNTY", "TENANTS"]),
    county: z.string().trim().min(1).max(100).optional(),
    tenantIds: z.array(z.string().uuid()).max(2000).optional(),
    email: z.boolean(),
    subject: z.string().trim().min(1, "Write a subject").max(200),
    body: z.string().trim().min(1, "Write the message").max(5000),
  })
  .refine((v) => v.audience !== "COUNTY" || !!v.county, { message: "Pick a county", path: ["county"] })
  .refine((v) => v.audience !== "TENANTS" || (v.tenantIds?.length ?? 0) > 0, { message: "Pick at least one tenant", path: ["tenantIds"] });

function siteUrl(): string {
  return (process.env.PUBLIC_SITE_URL || "https://www.zarodasports.live").replace(/\/$/, "");
}

function emailFor(name: string, subject: string, body: string) {
  const link = `${siteUrl()}/dashboard/messages`;
  return {
    subject: `${subject} - Zaroda Sports`,
    text: `Hello ${name},\n\n${body}\n\nReply from your dashboard: ${link}`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(body).replace(/\n/g, "<br>")}</p><p><a href="${link}">Reply from your Zaroda Sports dashboard</a></p>`,
  };
}

/**
 * The system owner messages tenants - all of them, one county's, or chosen
 * ones. Every tenant gets the message in their dashboard inbox (where they
 * can reply), and optionally by email; each email is logged.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole(["SUPER_ADMIN"]);
    const input = outreachSchema.parse(await request.json());

    const tenants = await prisma.tenant.findMany({
      where:
        input.audience === "COUNTY"
          ? { county: { equals: input.county, mode: "insensitive" } }
          : input.audience === "TENANTS"
            ? { id: { in: input.tenantIds } }
            : {},
      select: { id: true, organizationName: true, contactName: true, email: true, phone: true, userId: true },
    });
    if (tenants.length === 0) return NextResponse.json({ error: "No tenants match that audience" }, { status: 400 });

    // Everyone gets it in their dashboard inbox, where they can reply.
    const batchId = randomUUID();
    await prisma.adminMessage.createMany({
      data: tenants.map((t) => ({ senderId: ctx.userId, recipientId: t.userId, subject: input.subject, body: input.body, batchId })),
    });
    const messages = await prisma.adminMessage.findMany({ where: { batchId }, select: { id: true, recipientId: true } });
    const messageFor = new Map(messages.map((m) => [m.recipientId, m.id]));
    const deliveries: { messageId: string; channel: "EMAIL"; recipient: string; status: "SENT" | "FAILED"; error?: string }[] = [];

    if (input.email) {
      const results = await sendEmailBatch(tenants.map((t) => ({ to: t.email, ...emailFor(t.contactName || t.organizationName, input.subject, input.body) })));
      tenants.forEach((t, i) => {
        const r = results[i]!;
        deliveries.push({ messageId: messageFor.get(t.userId)!, channel: "EMAIL", recipient: t.email, status: r.sent ? "SENT" : "FAILED", error: r.error });
      });
    }

    if (deliveries.length > 0) await prisma.messageDelivery.createMany({ data: deliveries });
    await prisma.auditLog.create({
      data: {
        changedBy: ctx.userId,
        operation: "INSERT",
        tableName: "admin_messages",
        recordId: batchId,
        newData: { audience: input.audience, county: input.county ?? null, tenants: tenants.length, email: input.email, subject: input.subject },
      },
    });

    const count = (status: string) => deliveries.filter((d) => d.status === status).length;
    return NextResponse.json({
      batchId,
      tenants: tenants.length,
      email: input.email ? { sent: count("SENT"), failed: count("FAILED") } : null,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Recent sends with their email results, tenants' replies, and whether email is set up. */
export async function GET() {
  try {
    const ctx = await requireRole(["SUPER_ADMIN"]);

    const [sent, replies] = await Promise.all([
      prisma.adminMessage.findMany({
        where: { batchId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 1000,
        select: {
          batchId: true,
          subject: true,
          createdAt: true,
          recipient: { select: { tenant: { select: { organizationName: true } } } },
          deliveries: { select: { channel: true, status: true, error: true, recipient: true } },
        },
      }),
      prisma.adminMessage.findMany({
        where: { recipientId: ctx.userId, parentId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          parentId: true,
          subject: true,
          body: true,
          readAt: true,
          createdAt: true,
          sender: { select: { id: true, name: true, email: true, tenant: { select: { organizationName: true } } } },
        },
      }),
    ]);

    type Batch = {
      batchId: string;
      subject: string;
      createdAt: Date;
      tenants: number;
      email: { sent: number; failed: number };
      problems: { tenant: string; channel: string; recipient: string; error: string }[];
    };
    const batches = new Map<string, Batch>();
    for (const m of sent) {
      const b =
        batches.get(m.batchId!) ??
        batches
          .set(m.batchId!, { batchId: m.batchId!, subject: m.subject, createdAt: m.createdAt, tenants: 0, email: { sent: 0, failed: 0 }, problems: [] })
          .get(m.batchId!)!;
      b.tenants++;
      for (const d of m.deliveries) {
        if (d.channel !== "EMAIL") continue;
        if (d.status === "SENT") b.email.sent++;
        else b.email.failed++;
        if (d.status !== "SENT") {
          b.problems.push({ tenant: m.recipient?.tenant?.organizationName ?? "Unknown", channel: d.channel, recipient: d.recipient, error: d.error ?? d.status });
        }
      }
    }

    return NextResponse.json({
      emailReady: isEmailConfigured(),
      batches: Array.from(batches.values()).slice(0, 20),
      replies,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Marks tenants' replies to the caller as read. */
export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole(["SUPER_ADMIN"]);
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(await request.json());
    await prisma.adminMessage.updateMany({ where: { id: { in: ids }, recipientId: ctx.userId, readAt: null }, data: { readAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
