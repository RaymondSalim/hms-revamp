import { describe, it, expect, beforeEach, vi } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import bcrypt from "bcrypt";

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test" });
vi.mock("nodemailer", () => {
  const createTransport = () => ({
    sendMail: (...args: any[]) => mockSendMail(...args),
  });
  return { default: { createTransport }, createTransport };
});

// Imported AFTER the mock so the mocked transport is used.
import { resetPasswordAction } from "@/app/(external)/(auth)/reset-password/reset-action";
import { confirmResetAction } from "@/app/(external)/(auth)/reset-password/confirm/confirm-action";

// Pull the token+email out of the link in the most recent email.
function extractLinkParams(): { token: string; email: string } {
  const html = mockSendMail.mock.calls.at(-1)![0].html as string;
  const match = html.match(/\/reset-password\/confirm\?([^"\s<]+)/);
  // The link is HTML-escaped in the email body (& -> &amp;), so decode before
  // parsing the query string.
  const query = match![1].replace(/&amp;/g, "&");
  const params = new URLSearchParams(query);
  return { token: params.get("token")!, email: params.get("email")! };
}

async function createUser(email: string) {
  return testPrisma.siteUser.create({
    data: {
      name: "User",
      email,
      password: await bcrypt.hash("oldpassword", 10),
    },
  });
}

describe("Tokenized password reset", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
    mockSendMail.mockClear();
  });

  it("emails a link and lets the user set a new password", async () => {
    const user = await createUser("reset@test.com");

    const req = await resetPasswordAction({ email: "reset@test.com" });
    expect(req.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    // Only the hash is stored, never the raw token.
    const stored = await testPrisma.verificationToken.findMany({
      where: { identifier: "reset@test.com" },
    });
    expect(stored).toHaveLength(1);

    const { token, email } = extractLinkParams();
    expect(stored[0].token).not.toBe(token);

    const res = await confirmResetAction({
      email,
      token,
      password: "newpassword123",
      confirmPassword: "newpassword123",
    });
    expect(res.success).toBe(true);

    // New password is active; the token is consumed.
    const updated = await testPrisma.siteUser.findUnique({
      where: { id: user.id },
    });
    expect(await bcrypt.compare("newpassword123", updated!.password)).toBe(true);
    const remaining = await testPrisma.verificationToken.findMany({
      where: { identifier: "reset@test.com" },
    });
    expect(remaining).toHaveLength(0);
  });

  it("rejects a reused (already-consumed) token", async () => {
    await createUser("once@test.com");
    await resetPasswordAction({ email: "once@test.com" });
    const { token, email } = extractLinkParams();

    const first = await confirmResetAction({
      email,
      token,
      password: "newpassword123",
      confirmPassword: "newpassword123",
    });
    expect(first.success).toBe(true);

    const second = await confirmResetAction({
      email,
      token,
      password: "anotherpass123",
      confirmPassword: "anotherpass123",
    });
    expect(second.success).toBe(false);
  });

  it("rejects an expired token", async () => {
    await createUser("expired@test.com");
    await resetPasswordAction({ email: "expired@test.com" });
    const { token, email } = extractLinkParams();

    // Force the stored token to be in the past.
    await testPrisma.verificationToken.updateMany({
      where: { identifier: "expired@test.com" },
      data: { expires: new Date(Date.now() - 1000) },
    });

    const res = await confirmResetAction({
      email,
      token,
      password: "newpassword123",
      confirmPassword: "newpassword123",
    });
    expect(res.success).toBe(false);
    // Expired token is cleaned up on rejection.
    const remaining = await testPrisma.verificationToken.findMany({
      where: { identifier: "expired@test.com" },
    });
    expect(remaining).toHaveLength(0);
  });

  it("rejects a forged token for a real email", async () => {
    await createUser("forge@test.com");
    await resetPasswordAction({ email: "forge@test.com" });

    const res = await confirmResetAction({
      email: "forge@test.com",
      token: "deadbeef".repeat(8),
      password: "newpassword123",
      confirmPassword: "newpassword123",
    });
    expect(res.success).toBe(false);
  });

  it("does not reveal whether an email exists", async () => {
    const res = await resetPasswordAction({ email: "nobody@test.com" });
    expect(res.success).toBe(true);
    expect(mockSendMail).not.toHaveBeenCalled();
    const tokens = await testPrisma.verificationToken.findMany();
    expect(tokens).toHaveLength(0);
  });

  it("invalidates a prior token when a new one is requested", async () => {
    await createUser("twice@test.com");

    await resetPasswordAction({ email: "twice@test.com" });
    const first = extractLinkParams();

    await resetPasswordAction({ email: "twice@test.com" });
    const second = extractLinkParams();

    // The first link must no longer work.
    const stale = await confirmResetAction({
      email: first.email,
      token: first.token,
      password: "newpassword123",
      confirmPassword: "newpassword123",
    });
    expect(stale.success).toBe(false);

    // The newest link works.
    const fresh = await confirmResetAction({
      email: second.email,
      token: second.token,
      password: "newpassword123",
      confirmPassword: "newpassword123",
    });
    expect(fresh.success).toBe(true);
  });
});
