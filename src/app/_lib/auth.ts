import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { getUserByEmail, getUserById } from "@/app/_db/site-users";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
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
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 15 }, // 15 minutes
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role_id = (user as any).role_id;
        token.shouldReset = (user as any).shouldReset;
        token.location_ids = (user as any).location_ids ?? [];
      } else if (token.id) {
        const dbUser = await getUserById(token.id as string);
        if (dbUser) {
          token.role_id = dbUser.role_id ?? 0;
          token.shouldReset = dbUser.shouldReset;
          token.location_ids = dbUser.userLocations.map((ul) => ul.location_id);
        }
      }
      return token;
    },
    async session({ session, token }) {
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
