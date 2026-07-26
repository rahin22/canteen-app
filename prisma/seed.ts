import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const adminExists = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!adminExists) {
    await prisma.user.create({
      data: {
        role: "ADMIN",
        name: "Canteen Admin",
        username: "admin",
        passwordHash: await bcrypt.hash("admin1234", 10),
      },
    });
    console.log("Created admin user — username: admin, password: admin1234");
    console.log("CHANGE THIS PASSWORD after first login (Password link, top right).");
  }

  const menuCount = await prisma.menuItem.count();
  if (menuCount === 0) {
    await prisma.menuItem.createMany({
      data: [
        { name: "Sandwich", price: 350, category: "Food", sortOrder: 1 },
        { name: "Chicken roll", price: 450, category: "Food", sortOrder: 2 },
        { name: "Fruit cup", price: 200, category: "Food", sortOrder: 3 },
        { name: "Muffin", price: 250, category: "Snacks", sortOrder: 4 },
        { name: "Cookies", price: 150, category: "Snacks", sortOrder: 5 },
        { name: "Water", price: 100, category: "Drinks", sortOrder: 6 },
        { name: "Juice", price: 200, category: "Drinks", sortOrder: 7 },
        { name: "Milk", price: 150, category: "Drinks", sortOrder: 8 },
      ],
    });
    console.log("Seeded sample menu items.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
