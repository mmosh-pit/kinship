import crypto from "crypto";
export const decryptData = (data: string): string => {
    try {
        const secretKey = process.env.SECRET_KEY || "F0N9ogWmYbWDc6smA94dCPkvhck5L5FQjYAaZ39ZrM";
        const encryptionMethod = process.env.ENCRYPTION_METHOD || "aes-256-cbc";
        const secretIv = process.env.SECRET_IV || "60e142d4325237a695aa95afddea8687";

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

        const decipher = crypto.createDecipheriv(
            encryptionMethod,
            key,
            encryptionIV
        );

        const encryptedHex = Buffer.from(data, "base64").toString("hex");

        return (
            decipher.update(encryptedHex, "hex", "utf8") +
            decipher.final("utf8")
        );
    } catch (error) {
        return "";
    }
};

export const encryptData = (data: string): string => {
    try {
        const secretKey = process.env.SECRET_KEY || "F0N9ogWmYbWDc6smA94dCPkvhck5L5FQjYAaZ39ZrM";
        const encryptionMethod = process.env.ENCRYPTION_METHOD || "aes-256-cbc";
        const secretIv = process.env.SECRET_IV || "60e142d4325237a695aa95afddea8687";

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

        const encrypted =
            cipher.update(data, "utf8", "hex") + cipher.final("hex");

        return Buffer.from(encrypted, "hex").toString("base64") || "";
    } catch (error) {
        return "";
    }
};
