import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

const TYPES = ["PURCHASE", "TOPUP_CASH", "TOPUP_STRIPE", "ADJUSTMENT"] as const;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const type = TYPES.includes(params.get("type") as (typeof TYPES)[number])
    ? (params.get("type") as (typeof TYPES)[number])
    : undefined;
  const from = params.get("from");
  const to = params.get("to");

  const where: Prisma.TransactionWhereInput = {
    ...(type ? { type } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lt: addDay(to) } : {}),
          },
        }
      : {}),
  };

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 20000,
    include: {
      student: { select: { name: true, username: true, className: true } },
      operator: { select: { name: true } },
    },
  });

  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [
    "Date,Time,Student,Student ID,Class,Type,Amount,Detail,Operator",
    ...transactions.map((tx) => {
      const items = Array.isArray(tx.items)
        ? (tx.items as { name?: string; qty?: number }[])
            .map((l) => (l.qty && l.qty > 1 ? `${l.name} x${l.qty}` : l.name))
            .join("; ")
        : "";
      const detail = [items, tx.note].filter(Boolean).join("; ");
      return [
        tx.createdAt.toISOString().slice(0, 10),
        tx.createdAt.toISOString().slice(11, 19),
        esc(tx.student.name),
        tx.student.username,
        esc(tx.student.className || ""),
        tx.type,
        (tx.amount / 100).toFixed(2),
        esc(detail),
        esc(tx.operator?.name || ""),
      ].join(",");
    }),
  ];

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function addDay(date: string) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d;
}
