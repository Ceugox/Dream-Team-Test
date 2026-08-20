import { NextResponse } from "next/server";
import { getMemberSession } from "@/lib/platform/auth";
import { replaceNetworkContacts } from "@/lib/platform/repository";
import { parseLinkedInExport } from "@/lib/sources/linkedin";
export async function POST(request:Request){const session=await getMemberSession();if(!session)return NextResponse.json({error:"unauthorized"},{status:401});const form=await request.formData();const file=form.get("file");if(!(file instanceof File)||file.size>5_000_000)return NextResponse.json({error:"invalid_file"},{status:400});try{const contacts=parseLinkedInExport(JSON.parse(await file.text()));await replaceNetworkContacts(session.memberId,contacts);return NextResponse.json({count:contacts.length});}catch{return NextResponse.json({error:"invalid_json"},{status:400});}}
