import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { createNote, deleteNote, getNotesByTenant } from "@/app/_db/notes";

describe("Notes CRUD", () => {
  let tenantId: string;
  let userId: string;
  let bookingId: number;

  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();

    const tenant = await testPrisma.tenant.create({
      data: { name: "Note Tenant", id_number: "NNN" },
    });
    tenantId = tenant.id;

    const user = await testPrisma.siteUser.create({
      data: { name: "Author", email: "author@test.com", password: "hash" },
    });
    userId = user.id;

    const booking = await testPrisma.booking.create({
      data: {
        room_id: 1,
        start_date: new Date("2026-01-01"),
        fee: 3000000,
        tenant_id: tenantId,
        status_id: 2,
      },
    });
    bookingId = booking.id;
  });

  it("createNote creates a tenant-level note", async () => {
    const note = await createNote({
      content: "Important info",
      tenant_id: tenantId,
      created_by: userId,
    });

    expect(note.id).toBeDefined();
    expect(note.content).toBe("Important info");
    expect(note.tenant_id).toBe(tenantId);
    expect(note.created_by).toBe(userId);
  });

  it("deleteNote removes the note", async () => {
    const note = await createNote({
      content: "To be deleted",
      tenant_id: tenantId,
      created_by: userId,
    });

    await deleteNote(note.id);

    const found = await testPrisma.note.findUnique({ where: { id: note.id } });
    expect(found).toBeNull();
  });

  it("getNotesByTenant returns tenant notes and booking notes", async () => {
    await createNote({ content: "Tenant note", tenant_id: tenantId, created_by: userId });
    await createNote({ content: "Booking note", booking_id: bookingId, created_by: userId });

    const notes = await getNotesByTenant(tenantId, [bookingId]);

    expect(notes).toHaveLength(2);
    expect(notes[0].author.name).toBe("Author");
  });
});
