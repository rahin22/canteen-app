import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MenuManager } from "./menu-manager";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  await requireRole("ADMIN");
  const items = await prisma.menuItem.findMany({
    orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Menu</h1>
      <p className="mb-6 text-sm text-slate-500">
        These items appear as tap-buttons on the till. Deactivate items instead of
        deleting them so past purchases keep their history.
      </p>
      <MenuManager
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          category: i.category,
          active: i.active,
        }))}
      />
    </div>
  );
}
