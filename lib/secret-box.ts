import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts secrets kept in the database (a manager's TUMA API key) with AES-256-GCM.
 * The key comes from PAYMENT_KEYS_SECRET, falling back to NEXTAUTH_SECRET so it works on the existing server settings.
 */
function key(): Buffer {
  const secret = process.env.PAYMENT_KEYS_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error("PAYMENT_KEYS_SECRET (or NEXTAUTH_SECRET) must be set to store payment keys");
  return createHash("sha256").update(secret).digest();
}

/** "v1:<iv>:<tag>:<data>", all base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unreadable stored key");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
