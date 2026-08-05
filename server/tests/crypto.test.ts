import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../src/lib/crypto.js";

const CHAVE = "0".repeat(64);

describe("lib/crypto (cifra do access_token do Instagram)", () => {
  it("cifra e decifra de volta ao texto original", () => {
    const original = "EAABsbCS1234567890abcdefTOKENSECRETO";
    const cifrado = encrypt(original, CHAVE);
    expect(cifrado).not.toBe(original);
    expect(decrypt(cifrado, CHAVE)).toBe(original);
  });

  it("gera saidas diferentes a cada chamada (IV aleatorio)", () => {
    const a = encrypt("mesmo texto", CHAVE);
    const b = encrypt("mesmo texto", CHAVE);
    expect(a).not.toBe(b);
  });

  it("falha ao decifrar com a chave errada", () => {
    const cifrado = encrypt("texto secreto", CHAVE);
    const outraChave = "1".repeat(64);
    expect(() => decrypt(cifrado, outraChave)).toThrow();
  });

  it("rejeita chave com tamanho invalido", () => {
    expect(() => encrypt("x", "chave-curta")).toThrow();
  });
});
