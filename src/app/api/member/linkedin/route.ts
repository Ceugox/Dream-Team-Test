import { NextResponse } from "next/server";
import { getMemberSession } from "@/lib/platform/auth";
import { upsertNetworkContacts } from "@/lib/platform/repository";
import { parseLinkedInExport } from "@/lib/sources/linkedin";
// Upsert incremental por linkedin_url: coletas parciais nunca reduzem a rede já mapeada.
export async function POST(request:Request){const session=await getMemberSession();if(!session)return NextResponse.json({error:"unauthorized"},{status:401});try{const contentType=request.headers.get("content-type")??"";let raw:unknown;if(contentType.includes("application/json")){const body=await request.json();if(body?.mode!=="browser-sync")throw new Error("invalid_mode");raw=body.contacts;}else{const form=await request.formData();const file=form.get("file");if(!(file instanceof File)||file.size>5_000_000)return NextResponse.json({error:"invalid_file"},{status:400});raw=JSON.parse(await file.text());}const contacts=parseLinkedInExport(raw);await upsertNetworkContacts(session.memberId,contacts);return NextResponse.json({count:contacts.length});}catch{return NextResponse.json({error:"invalid_linkedin_data"},{status:400});}}
