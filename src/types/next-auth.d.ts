import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role_id: number;
      shouldReset: boolean;
      location_ids: number[];
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role_id: number | null;
    shouldReset: boolean;
    location_ids: number[];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role_id: number;
    shouldReset: boolean;
    location_ids: number[];
  }
}
