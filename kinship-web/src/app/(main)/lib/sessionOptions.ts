import { SessionOptions } from "iron-session";

export const sessionOptions: SessionOptions = {
  password: process.env.NEXT_PUBLIC_SESSION_PASSWORD!, // must be at least 32 characters
  cookieName: "kingship_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production", // use `true` in production
  },
};

// Type your session data:
declare module "iron-session" {
  interface IronSessionData {
    user?: {
      id: string;
      email: string;
    };
  }
}
