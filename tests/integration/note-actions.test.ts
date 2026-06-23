import { describe, it, expect, beforeEach, vi } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";

import { addNoteAction, deleteNoteAction } from "@/app/(internal)/(dashboard_layout)/residents/tenants/[id]/notes-action";

// Override auth mock to return a specific user id
vi.mocked((await import("@/app/_lib/auth")).auth).mockResolvedValue({
  user: { id: "test-user-id", name: "Test User", email: "test@test.com" },
} as any);

describe("Note server actions", () => {
  let tenantId: string;

  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();

    const user = await testPrisma.siteUser.create({
      data: { id: "test-user-id", name: "Test User", email: "test@test.com", password: "hash" },
    });

    const tenant = await testPrisma.tenant.create({
      data: { name: "Action Tenant", id_number: "ACT001" },
    });
    tenantId = tenant.id;
  });

  it("addNoteAction creates a note", async () => {
    const result = await addNoteAction(tenantId, "Hello from action");
    expect(result.success).toBe(true);

    const notes = await testPrisma.note.findMany({ where: { tenant_id: tenantId } });
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toBe("Hello from action");
    expect(notes[0].created_by).toBe("test-user-id");
  });

  it("addNoteAction rejects empty content", async () => {
    const result = await addNoteAction(tenantId, "   ");
    expect(result.success).toBe(false);
  });

  it("deleteNoteAction removes a note", async () => {
    const note = await testPrisma.note.create({
      data: { content: "Delete me", tenant_id: tenantId, created_by: "test-user-id" },
    });

    const result = await deleteNoteAction(note.id);
    expect(result.success).toBe(true);

    const found = await testPrisma.note.findUnique({ where: { id: note.id } });
    expect(found).toBeNull();
  });
});
