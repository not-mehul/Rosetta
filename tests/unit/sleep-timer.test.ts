import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor-community/text-to-speech", () => ({
  TextToSpeech: {
    speak: vi.fn(),
    stop: vi.fn(async () => undefined),
    getSupportedVoices: vi.fn(async () => ({ voices: [] })),
  },
}));

const { speech, SLEEP_CHOICES } = await import("../../src/state/speech.svelte");

describe("the sleep timer", () => {
  it("steps through off, minutes and the end of the chapter, and back to off", () => {
    const seen: unknown[] = [];
    speech.setSleep(null);
    for (let i = 0; i < SLEEP_CHOICES.length; i++) {
      seen.push(speech.sleep?.choice ?? null);
      speech.setSleep(speech.nextSleep(), 0);
    }
    expect(seen).toEqual([null, 15, 30, 45, 60, "chapter"]);
    expect(speech.sleep).toBeNull();
  });

  it("counts minutes from when it was set, and the chapter has no clock", () => {
    speech.setSleep(30, 1_000);
    expect(speech.sleep).toEqual({ choice: 30, at: 1_000 + 30 * 60_000 });
    speech.setSleep("chapter", 1_000);
    expect(speech.sleep).toEqual({ choice: "chapter", at: null });
    speech.stop();
    expect(speech.sleep).toBeNull();
  });
});
