import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import {
  setUserLocations,
  getUserLocationIds,
} from "@/app/_db/site-users";

describe("Location assignment", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function createUser() {
    return testPrisma.siteUser.create({
      data: {
        name: "Scoped User",
        email: `u-${Date.now()}@test.com`,
        password: "x",
      },
    });
  }

  async function createLocation(name: string) {
    return testPrisma.location.create({ data: { name, address: name } });
  }

  it("starts global (no assignments)", async () => {
    const user = await createUser();
    expect(await getUserLocationIds(user.id)).toEqual([]);
  });

  it("setUserLocations replaces the assignment set", async () => {
    const user = await createUser();
    const a = await createLocation("A");
    const b = await createLocation("B");
    const c = await createLocation("C");

    await setUserLocations(user.id, [a.id, b.id]);
    expect((await getUserLocationIds(user.id)).sort()).toEqual([a.id, b.id].sort());

    await setUserLocations(user.id, [c.id]);
    expect(await getUserLocationIds(user.id)).toEqual([c.id]);

    await setUserLocations(user.id, []);
    expect(await getUserLocationIds(user.id)).toEqual([]);
  });
});
