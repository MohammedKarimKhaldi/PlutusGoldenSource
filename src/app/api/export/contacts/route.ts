import { NextResponse } from "next/server";

import { buildContactsCsv, filterContactExportRows, isContactExportCriterion } from "@/lib/export/contacts";
import { getDashboardData } from "@/lib/data";

export const runtime = "nodejs";

function fileSafe(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "contacts";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const criterion = url.searchParams.get("criterion") ?? "";
  const value = url.searchParams.get("value") ?? "";

  if (!isContactExportCriterion(criterion)) {
    return NextResponse.json({ error: "Unsupported export criterion." }, { status: 400 });
  }

  const data = await getDashboardData();
  const rows = filterContactExportRows(data.companies, criterion, value);
  const csv = `${buildContactsCsv(rows)}\n`;
  const filename = `golden-source-${fileSafe(criterion)}-${fileSafe(value)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv;charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
