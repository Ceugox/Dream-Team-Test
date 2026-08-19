import { runPipeline } from "@/lib/orchestration/pipeline";
import { LinkedInSource, parseLinkedInExport } from "@/lib/sources/linkedin";
import { GmailSource, ContactsSource, CalendarSource } from "@/lib/sources/fixtures";
import { DEMO_LINKEDIN_CONNECTIONS } from "@/lib/sources/demoData";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");

  const demoMode = process.env.DEMO_MODE === "true";
  let connections = DEMO_LINKEDIN_CONNECTIONS;
  if (!demoMode && file instanceof File) {
    const text = await file.text();
    connections = parseLinkedInExport(JSON.parse(text));
  }

  const sources = [new LinkedInSource(connections), new GmailSource(), new ContactsSource(), new CalendarSource()];

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
