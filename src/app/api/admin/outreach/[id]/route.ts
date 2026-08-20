import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/platform/auth";
import { updateOutreach } from "@/lib/platform/repository";
const Schema=z.object({message:z.string().trim().min(10).max(2000).optional(),status:z.enum(["prepared","opened","manually_confirmed_sent","replied","referred","no_response","cancelled"]).optional()}).refine(value=>value.message||value.status);
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){const session=await getAdminSession();if(!session)return NextResponse.json({error:"unauthorized"},{status:401});const result=Schema.safeParse(await request.json());if(!result.success)return NextResponse.json({error:"invalid"},{status:400});const {id}=await params;await updateOutreach(id,session.administratorId,result.data);return NextResponse.json({ok:true});}
