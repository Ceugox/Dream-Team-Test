import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/platform/AppShell";
import { getMemberSession } from "@/lib/platform/auth";
import { getMember } from "@/lib/platform/repository";
export const dynamic="force-dynamic";
export default async function MemberLayout({children}:{children:ReactNode}){const session=await getMemberSession();if(!session)redirect("/");const member=await getMember(session.memberId);if(!member)redirect("/");return <AppShell mode="member" name={member.name}>{children}</AppShell>}
