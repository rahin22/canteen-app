import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { allSchools, currentSchoolId, currentSchoolName } from "@/lib/schools";
import { MenuManager } from "./menu-manager";
import { ModifiersManager } from "./modifiers-manager";
import { PickSchool } from "./pick-school";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  await requireRole("ADMIN");
  const [schoolId, schoolName, schools] = await Promise.all([
    currentSchoolId(),
    currentSchoolName(),
    allSchools(),
  ]);

  // Every item belongs to exactly one school, so there's no sensible "all
  // schools" version of this screen — editing would have nowhere to file a new
  // item. Ask which menu to work on instead of guessing.
  if (!schoolId) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">Menu</h1>
        <p className="mb-6 text-sm text-slate-500">
          Each school has its own menu. Choose which one to edit — you can also
          switch schools from the header at any time.
        </p>
        <PickSchool schools={schools.filter((s) => s.active)} />
      </div>
    );
  }

  const [items, groups] = await Promise.all([
    prisma.menuItem.findMany({
      where: { schoolId },
      orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
      include: { modifierGroups: { select: { id: true } } },
    }),
    prisma.modifierGroup.findMany({
      where: { schoolId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        items: { select: { id: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Menu</h1>
      <p className="mb-1 font-medium text-indigo-600">{schoolName}</p>
      <p className="mb-6 text-sm text-slate-500">
        These items appear as tap-buttons on the till and in preordering, for
        this school only. Deactivate items instead of deleting them so past
        purchases keep their history.
      </p>
      <MenuManager
        schoolId={schoolId}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          category: i.category,
          active: i.active,
          soldOut: i.soldOut,
        }))}
      />

      <h2 className="mb-1 mt-10 text-lg font-semibold text-slate-900">
        Choices &amp; combos
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Sauces, salad, drinks and the meals inside a combo. Build a group once
        and attach it to as many items as you like — adding a sauce then adds it
        everywhere at once.
      </p>
      <ModifiersManager
        schoolId={schoolId}
        items={items.map((i) => ({ id: i.id, name: i.name }))}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          active: g.active,
          options: g.options.map((o) => ({
            id: o.id,
            name: o.name,
            price: o.price,
            soldOut: o.soldOut,
          })),
          itemIds: g.items.map((i) => i.id),
        }))}
      />
    </div>
  );
}
