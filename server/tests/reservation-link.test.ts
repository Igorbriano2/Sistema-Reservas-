import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import {
  decodificarTokenDeReserva,
  gerarTokenDeReserva,
  TokenDeReservaInvalidoError,
} from "../src/lib/reservation-link.js";

describe("lib/reservation-link (token do link publico de reserva)", () => {
  it("gera e decodifica um token valido de ida e volta", () => {
    const token = gerarTokenDeReserva({ unidadeId: "unidade-1", igSenderId: "sender-1" });
    const payload = decodificarTokenDeReserva(token);
    expect(payload).toEqual({ unidadeId: "unidade-1", igSenderId: "sender-1" });
  });

  it("rejeita token expirado", () => {
    vi.useFakeTimers();
    try {
      const token = gerarTokenDeReserva({ unidadeId: "unidade-1", igSenderId: "sender-1" });
      vi.advanceTimersByTime(61 * 60 * 1000); // 61 minutos - passou dos 60 de validade
      expect(() => decodificarTokenDeReserva(token)).toThrow(TokenDeReservaInvalidoError);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aceita token dentro da validade (59 minutos depois)", () => {
    vi.useFakeTimers();
    try {
      const token = gerarTokenDeReserva({ unidadeId: "unidade-1", igSenderId: "sender-1" });
      vi.advanceTimersByTime(59 * 60 * 1000);
      expect(() => decodificarTokenDeReserva(token)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejeita token com assinatura adulterada", () => {
    const token = gerarTokenDeReserva({ unidadeId: "unidade-1", igSenderId: "sender-1" });
    const adulterado = token.slice(0, -2) + (token.at(-1) === "a" ? "b" : "a") + token.at(-2);
    expect(() => decodificarTokenDeReserva(adulterado)).toThrow(TokenDeReservaInvalidoError);
  });

  it("rejeita um JWT valido mas sem o campo 'purpose' correto (ex: nao pode ser reaproveitado como token de admin nem vice-versa)", () => {
    const outroToken = jwt.sign(
      { unidadeId: "unidade-1", igSenderId: "sender-1", purpose: "outra-coisa" },
      process.env.JWT_SECRET!,
      { expiresIn: "60m" },
    );
    expect(() => decodificarTokenDeReserva(outroToken)).toThrow(TokenDeReservaInvalidoError);
  });

  it("rejeita token sem unidadeId ou igSenderId", () => {
    const semCampos = jwt.sign({ purpose: "reservation_link" }, process.env.JWT_SECRET!, { expiresIn: "60m" });
    expect(() => decodificarTokenDeReserva(semCampos)).toThrow(TokenDeReservaInvalidoError);
  });

  it("rejeita string que nao e um JWT", () => {
    expect(() => decodificarTokenDeReserva("isso-nao-e-um-token")).toThrow(TokenDeReservaInvalidoError);
  });
});
