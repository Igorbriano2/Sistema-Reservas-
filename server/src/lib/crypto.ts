import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITMO = "aes-256-gcm";
const TAMANHO_IV = 12;
const TAMANHO_AUTH_TAG = 16;

function chaveComoBuffer(chaveHex: string): Buffer {
  const buffer = Buffer.from(chaveHex, "hex");
  if (buffer.length !== 32) {
    throw new Error("A chave de criptografia deve ter 32 bytes (64 caracteres hexadecimais)");
  }
  return buffer;
}

// Usado para cifrar o access_token do Instagram antes de gravar em
// instagram_connections.access_token_encrypted. Formato: base64(iv || authTag || ciphertext).
export function encrypt(textoPlano: string, chaveHex: string): string {
  const iv = randomBytes(TAMANHO_IV);
  const cipher = createCipheriv(ALGORITMO, chaveComoBuffer(chaveHex), iv);
  const ciphertext = Buffer.concat([cipher.update(textoPlano, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(base64: string, chaveHex: string): string {
  const dados = Buffer.from(base64, "base64");
  const iv = dados.subarray(0, TAMANHO_IV);
  const authTag = dados.subarray(TAMANHO_IV, TAMANHO_IV + TAMANHO_AUTH_TAG);
  const ciphertext = dados.subarray(TAMANHO_IV + TAMANHO_AUTH_TAG);
  const decipher = createDecipheriv(ALGORITMO, chaveComoBuffer(chaveHex), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
