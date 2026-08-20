import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/platform/auth";
import { listJobRecommendations, refreshAdminRecommendations } from "@/lib/platform/repository";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){if(!(await isAdmin()))return NextResponse.json({error:"unauthorized"},{status:401});const {id}=await params;return NextResponse.json({recommendations:await listJobRecommendations(id)});}
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){if(!(await isAdmin()))return NextResponse.json({error:"unauthorized"},{status:401});const {id}=await params;return NextResponse.json({count:await refreshAdminRecommendations(id)});}
