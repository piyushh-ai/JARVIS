import crypto from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

function scryptAsync(password, salt, keyLen, options) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLen, options, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

/**
 * Hashes a plaintext password using scrypt with a 16-byte CSPRNG salt.
 * Output format: scrypt$N$r$p$saltHex$hashHex
 */
export async function hashPassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Password must be a non-empty string");
  }

  const saltHex = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, saltHex, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${saltHex}$${derived.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored scrypt hash using constant-time equality.
 */
export async function verifyPassword(password, storedHash) {
  if (
    typeof password !== "string" ||
    password.length === 0 ||
    typeof storedHash !== "string"
  ) {
    return false;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const expectedHex = parts[5];

  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    n < 1024 ||
    n > 65536 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 8 ||
    !/^[0-9a-f]+$/i.test(saltHex) ||
    !/^[0-9a-f]+$/i.test(expectedHex) ||
    expectedHex.length % 2 !== 0
  ) {
    return false;
  }

  const expectedBuf = Buffer.from(expectedHex, "hex");
  const derived = await scryptAsync(password, saltHex, expectedBuf.length, {
    N: n,
    r,
    p,
  });

  if (derived.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(derived, expectedBuf);
}

