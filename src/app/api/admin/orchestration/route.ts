import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/platform/auth";
import { listWorkflows } from "@/lib/orchestration/orchestrator";

export async function GET(){if(!(await isAdmin()))return NextResponse.json({error:"unauthorized"},{status:401});return NextResponse.json({workflows:await listWorkflows(50)});}
