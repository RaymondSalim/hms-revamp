import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { getUserByEmail, getUserById } from "@/app/_db/site-users";

const SESSION_MAX_AGE_SHORT = 60 * 60; // 1 hour (active session, kept alive by rotation)
const SESSION_MAX_AGE_LONG = 60 * 60 * 24 * 30; // 30 days ("keep me signed in")
const TOKEN_REFRESH_INTERVAL = 60 * 15; // Rotate token every 15 minutes of activity

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await getUserByEmail(credentials.email as string);
        if (!user) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role_id: user.role_id,
          shouldReset: user.shouldReset,
          location_ids: user.userLocations.map((ul) => ul.location_id),
          rememberMe: credentials.rememberMe === "true",
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_LONG },
  callbacks: {
    async jwt({ token, user, trigger, session: updateData }) {
      const now = Math.floor(Date.now() / 1000);

      if (trigger === "update" && updateData) {
        if (updateData.user?.shouldReset !== undefined) {
          token.shouldReset = updateData.user.shouldReset;
        }
        return token;
      }

      if (user) {
        // Initial login — store all user data + session preferences
        token.id = user.id!;
        token.role_id = (user as any).role_id;
        token.shouldReset = (user as any).shouldReset;
        token.location_ids = (user as any).location_ids ?? [];
        token.rememberMe = (user as any).rememberMe ?? false;
        token.issuedAt = now;
        token.expiresAt = now + ((user as any).rememberMe ? SESSION_MAX_AGE_LONG : SESSION_MAX_AGE_SHORT);
      } else if (token.id) {
        // Subsequent requests — check expiry and rotate
        const expiresAt = (token.expiresAt as number) ?? 0;
        if (now > expiresAt) {
          // Token has expired — return empty token to force re-login
          return {} as typeof token;
        }

        const issuedAt = (token.issuedAt as number) ?? 0;
        if (now - issuedAt > TOKEN_REFRESH_INTERVAL) {
          // Rotate: refresh user data from DB and reset issuedAt
          const dbUser = await getUserById(token.id as string);
          if (dbUser) {
            token.role_id = dbUser.role_id ?? 0;
            token.shouldReset = dbUser.shouldReset;
            token.location_ids = dbUser.userLocations.map((ul) => ul.location_id);
          }
          token.issuedAt = now;
          // Extend expiry for active sessions (sliding window)
          const maxAge = token.rememberMe ? SESSION_MAX_AGE_LONG : SESSION_MAX_AGE_SHORT;
          token.expiresAt = now + maxAge;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // If token was invalidated (empty id), signal no session
      if (!token.id) {
        return { ...session, user: undefined as any };
      }
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role_id = token.role_id as number;
        session.user.shouldReset = token.shouldReset as boolean;
        session.user.location_ids = (token.location_ids as number[]) ?? [];
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
