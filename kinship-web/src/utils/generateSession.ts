import crypto from "crypto";

export const generateSession = () => {
  return crypto.randomBytes(16).toString("base64");
};
