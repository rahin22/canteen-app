"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { setSetting, SETTINGS } from "@/lib/settings";

export async function setFlag(key: string, enabled: boolean) {
  await requireRole("ADMIN");
  // Only known keys — never let a client name an arbitrary setting row.
  const allowed: string[] = [SETTINGS.onlineTopups, SETTINGS.parentSignup];
  if (!allowed.includes(key)) return;

  await setSetting(key, enabled ? "on" : "off");
  revalidatePath("/admin/settings");
  revalidatePath("/me");
  revalidatePath("/me/topup");
  revalidatePath("/family");
  revalidatePath("/login");
}
