import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

declare const encryptedProviderSessionReferenceBrand: unique symbol;

export type EncryptedProviderSessionReference = string & {
  readonly [encryptedProviderSessionReferenceBrand]: "EncryptedProviderSessionReference";
};

const ENVELOPE_PREFIX = "enc:v1:";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function cryptoSecret(appSecret?: string): string {
  const value = appSecret ?? process.env.APP_SECRET;
  if (!value) throw new Error("LINKEDIN_CRYPTO_SECRET_UNAVAILABLE");
  return value;
}

function encryptionKey(appSecret?: string): Buffer {
  return createHash("sha256")
    .update("linkedin-provider-session-reference:v1\0")
    .update(cryptoSecret(appSecret), "utf8")
    .digest();
}

function invalidEnvelope(): never {
  throw new Error("INVALID_ENCRYPTED_PROVIDER_SESSION_REFERENCE");
}

function parseEnvelope(envelope: string): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  if (!envelope.startsWith(ENVELOPE_PREFIX)) return invalidEnvelope();
  const encoded = envelope.slice(ENVELOPE_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return invalidEnvelope();
  const payload = Buffer.from(encoded, "base64url");
  if (payload.length <= IV_BYTES + AUTH_TAG_BYTES) return invalidEnvelope();
  return {
    iv: payload.subarray(0, IV_BYTES),
    tag: payload.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES),
    ciphertext: payload.subarray(IV_BYTES + AUTH_TAG_BYTES),
  };
}

export function encryptProviderSessionReference(plaintext: string, appSecret?: string): EncryptedProviderSessionReference {
  if (typeof plaintext !== "string" || !plaintext) {
    throw new Error("LINKEDIN_PROVIDER_SESSION_ENCRYPTION_FAILED");
  }
  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(appSecret), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const envelope = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
    return `${ENVELOPE_PREFIX}${envelope}` as EncryptedProviderSessionReference;
  } catch (error) {
    if (error instanceof Error && error.message === "LINKEDIN_CRYPTO_SECRET_UNAVAILABLE") throw error;
    throw new Error("LINKEDIN_PROVIDER_SESSION_ENCRYPTION_FAILED");
  }
}

export function decryptProviderSessionReference(envelope: string, appSecret?: string): string {
  try {
    const { iv, tag, ciphertext } = parseEnvelope(envelope);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(appSecret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message === "LINKEDIN_CRYPTO_SECRET_UNAVAILABLE") throw error;
    return invalidEnvelope();
  }
}

export function assertEncryptedProviderSessionReference(
  envelope: string,
  appSecret?: string,
): EncryptedProviderSessionReference {
  decryptProviderSessionReference(envelope, appSecret);
  return envelope as EncryptedProviderSessionReference;
}
