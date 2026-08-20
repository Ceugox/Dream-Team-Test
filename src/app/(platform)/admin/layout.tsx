import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/platform/AppShell";
import { getAdminSession } from "@/lib/platform/auth";
import { getAdministrator } from "@/lib/platform/repository";

export const dynamic = "force-dynamic";
export default async function AdminLayout({children}:{children:ReactNode}) {
  const session=await getAdminSession();
  if (!session) redirect("/admin/login");
  const administrator=await getAdministrator(session.administratorId);
  if (!administrator) redirect("/admin/login");
  return <AppShell mode="admin" name={administrator.name}>{children}</AppShell>;
}
