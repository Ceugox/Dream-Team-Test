import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/platform/auth";
import { updateReferralStatus } from "@/lib/platform/repository";
const Status=z.enum(["submitted","reviewing","contacted","declined","hired"]);
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){if(!(await isAdmin()))return NextResponse.json({error:"unauthorized"},{status:401});const body=z.object({status:Status}).safeParse(await request.json());if(!body.success)return NextResponse.json({error:"invalid"},{status:400});await updateReferralStatus((await params).id,body.data.status);return NextResponse.json({ok:true});}
