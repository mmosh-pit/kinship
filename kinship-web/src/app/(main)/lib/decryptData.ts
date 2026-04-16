import crypto from "crypto";

export function decryptData(encryptedData: string) {
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

  const buff = Buffer.from(encryptedData, "base64");
  const decipher = crypto.createDecipheriv(encryptionMethod, key, encryptionIV);
  return (
    decipher.update(buff.toString("utf8"), "hex", "utf8") +
    decipher.final("utf8")
  ); // Decrypts data and converts to utf8
}
