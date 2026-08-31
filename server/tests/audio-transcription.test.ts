import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/openai-client.js", () => ({
  getOpenAiClient: vi.fn(),
}));

const URL_AUDIO = "https://cdn.example/audio.m4a";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// vi.resetModules + import dinamico porque env.ts congela process.env num objeto no
// momento do import (mudar process.env depois nao afeta um modulo ja carregado) -
// mesmo padrao de agent-orchestrator-fallback.test.ts.
describe("transcreverAudioDoInstagram (doc 42)", () => {
  it("baixa o audio e devolve o texto transcrito pela OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-teste-fake");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "audio/mp4" }),
        arrayBuffer: async () => new ArrayBuffer(8),
      }),
    );
    const { getOpenAiClient } = await import("../src/lib/openai-client.js");
    const criarTranscricao = vi.fn().mockResolvedValue({ text: "Quero reservar uma mesa" });
    vi.mocked(getOpenAiClient).mockReturnValue({
      audio: { transcriptions: { create: criarTranscricao } },
    } as unknown as ReturnType<typeof getOpenAiClient>);

    const { transcreverAudioDoInstagram } = await import("../src/lib/audio-transcription.js");
    const texto = await transcreverAudioDoInstagram(URL_AUDIO);

    expect(texto).toBe("Quero reservar uma mesa");
    expect(criarTranscricao).toHaveBeenCalledTimes(1);
  });

  it("devolve null (sem lancar) quando o download do audio falha", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-teste-fake");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const { transcreverAudioDoInstagram } = await import("../src/lib/audio-transcription.js");
    expect(await transcreverAudioDoInstagram(URL_AUDIO)).toBeNull();
  });

  it("devolve null quando a transcricao vem vazia", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-teste-fake");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "audio/mp4" }),
        arrayBuffer: async () => new ArrayBuffer(8),
      }),
    );
    const { getOpenAiClient } = await import("../src/lib/openai-client.js");
    vi.mocked(getOpenAiClient).mockReturnValue({
      audio: { transcriptions: { create: vi.fn().mockResolvedValue({ text: "   " }) } },
    } as unknown as ReturnType<typeof getOpenAiClient>);

    const { transcreverAudioDoInstagram } = await import("../src/lib/audio-transcription.js");
    expect(await transcreverAudioDoInstagram(URL_AUDIO)).toBeNull();
  });

  it("devolve null quando OPENAI_API_KEY nao esta configurada, sem tentar baixar o audio", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { transcreverAudioDoInstagram } = await import("../src/lib/audio-transcription.js");
    expect(await transcreverAudioDoInstagram(URL_AUDIO)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("devolve null (sem lancar) quando a chamada a OpenAI falha", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-teste-fake");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "audio/mp4" }),
        arrayBuffer: async () => new ArrayBuffer(8),
      }),
    );
    const { getOpenAiClient } = await import("../src/lib/openai-client.js");
    vi.mocked(getOpenAiClient).mockReturnValue({
      audio: { transcriptions: { create: vi.fn().mockRejectedValue(new Error("rate limit")) } },
    } as unknown as ReturnType<typeof getOpenAiClient>);

    const { transcreverAudioDoInstagram } = await import("../src/lib/audio-transcription.js");
    expect(await transcreverAudioDoInstagram(URL_AUDIO)).toBeNull();
  });
});
