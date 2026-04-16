import crypto from "crypto";

export function encryptData(data: any): string {
  const encryptionMethod = process.env.ENCRYPTION_METHOD!;
  const secretKey = process.env.SECRET_KEY!;
  const secretIv = process.env.SECRET_IV!;

  const key = crypto
    .createHash("sha512")
    .update(secretKey)
    .digest("hex")
    .substring(0, 32);

  const encryptionIV = crypto
    .createHash("sha512")
    .update(secretIv)
    .digest("hex")
    .substring(0, 16);

  const cipher = crypto.createCipheriv(encryptionMethod, key, encryptionIV);
  return Buffer.from(
    cipher.update(data, "utf8", "hex") + cipher.final("hex"),
  ).toString("base64"); // Encrypts data and converts to hex and base64
}
