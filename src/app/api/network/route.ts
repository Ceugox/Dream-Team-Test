import { runPipeline } from "@/lib/orchestration/pipeline";
import { LinkedInSource, parseLinkedInExport } from "@/lib/sources/linkedin";
import { GmailSource, ContactsSource, CalendarSource } from "@/lib/sources/fixtures";
import { DEMO_LINKEDIN_CONNECTIONS } from "@/lib/sources/demoData";
import type { NetworkSource } from "@/lib/sources/base";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");

  const demoMode = process.env.DEMO_MODE === "true";
  const hasRealUpload = !demoMode && file instanceof File;

  let connections = DEMO_LINKEDIN_CONNECTIONS;
  if (hasRealUpload) {
    try {
      const text = await (file as File).text();
      connections = parseLinkedInExport(JSON.parse(text));
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: `Invalid network export: ${err instanceof Error ? err.message : String(err)}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Gmail/Contacts/Calendar are always fixture-backed (no OAuth in this MVP — see
  // README "O que deliberadamente não construímos"). Only blend them in when
  // LinkedIn itself is also running on fixture/demo data, so a real uploaded
  // network is never silently mixed with fictional people.
  const sources: NetworkSource[] = [new LinkedInSource(connections)];
  if (!hasRealUpload) {
    sources.push(new GmailSource(), new ContactsSource(), new CalendarSource());
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runPipeline(sources)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
