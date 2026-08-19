import { NextResponse } from "next/server";
import { z } from "zod";
import { PersonSchema } from "@/lib/domain/person";
import { parseJobDescription } from "@/lib/matching/jobParser";
import { rankCandidates } from "@/lib/matching/scoreRegistry";

const RequestSchema = z.object({
  jobDescription: z.string().min(1),
  titleHint: z.string().optional(),
  people: z.array(PersonSchema),
});

export async function POST(req: Request) {
  const body = RequestSchema.parse(await req.json());
  const job = parseJobDescription(body.jobDescription, body.titleHint);
  const candidates = rankCandidates(body.people, job);
  return NextResponse.json({ job, candidates });
}
