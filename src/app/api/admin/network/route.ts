import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/platform/auth";
import { parseAdminNetworkFile } from "@/lib/platform/adminNetwork";
import { addAdminNetworkContact, listAdminNetworkContacts, listJobs, refreshAdminRecommendations, replaceAdminNetworkContacts, updateAdminContactPhone } from "@/lib/platform/repository";
import { normalizePhone } from "@/lib/platform/whatsapp";
import { inferNetworkCapital } from "@/lib/platform/networkCapital";

export async function GET(){const session=await getAdminSession();if(!session)return NextResponse.json({error:"unauthorized"},{status:401});return NextResponse.json({contacts:await listAdminNetworkContacts(session.administratorId)});}

export async function POST(request:Request){
  const session=await getAdminSession();if(!session)return NextResponse.json({error:"unauthorized"},{status:401});
  const body=await request.json();
  if(body.mode==="replace"){
    try{const contacts=parseAdminNetworkFile(body.contacts);await replaceAdminNetworkContacts(session.administratorId,contacts);const jobs=await listJobs();await Promise.all(jobs.filter(job=>job.status==="open").map(job=>refreshAdminRecommendations(job.id)));return NextResponse.json({count:contacts.length});}
    catch{return NextResponse.json({error:"invalid_network_file"},{status:400});}
  }
  const result=z.object({mode:z.literal("manual"),name:z.string().trim().min(2).max(160),headline:z.string().trim().max(500).optional(),profileContext:z.string().trim().max(4000).optional(),linkedinUrl:z.url().max(1000).optional().or(z.literal("")),phone:z.string().min(8).max(40)}).safeParse(body);
  if(!result.success)return NextResponse.json({error:"invalid"},{status:400});
  const phone=normalizePhone(result.data.phone);if(!phone)return NextResponse.json({error:"invalid_phone"},{status:400});
  const capital=inferNetworkCapital({headline:result.data.headline??null,profileContext:result.data.profileContext??null});
  await addAdminNetworkContact(session.administratorId,{...result.data,phone,linkedinUrl:result.data.linkedinUrl||undefined,networkCapitalScore:capital.score,networkCapitalEvidence:capital.evidence,networkCapitalConfidence:capital.confidence});const jobs=await listJobs();await Promise.all(jobs.filter(job=>job.status==="open").map(job=>refreshAdminRecommendations(job.id)));return NextResponse.json({ok:true},{status:201});
}

export async function PATCH(request:Request){const session=await getAdminSession();if(!session)return NextResponse.json({error:"unauthorized"},{status:401});const result=z.object({id:z.uuid(),phone:z.string()}).safeParse(await request.json());if(!result.success)return NextResponse.json({error:"invalid"},{status:400});const phone=normalizePhone(result.data.phone);if(!phone)return NextResponse.json({error:"invalid_phone"},{status:400});await updateAdminContactPhone(session.administratorId,result.data.id,phone);return NextResponse.json({ok:true});}
