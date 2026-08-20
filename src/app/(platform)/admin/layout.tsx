import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/platform/AppShell";
import { isAdmin } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";
export default async function AdminLayout({children}:{children:ReactNode}) {
  if (!(await isAdmin())) redirect("/admin/login");
  return <AppShell mode="admin" name="Administrador">{children}</AppShell>;
}
