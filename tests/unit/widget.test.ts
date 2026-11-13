import { describe, expect, it } from "vitest";
import { bookToContinue } from "../../src/platform/widget";
import type { StoredDoc } from "../../src/state/db";

const doc = (
  id: string,
  openedAt: number | null,
  finishedAt: number | null = null,
  progress = 0.3,
) =>
  ({
    id,
    title: id,
    author: "",
    openedAt,
    finishedAt,
    progress,
  }) as unknown as StoredDoc;

describe("bookToContinue", () => {
  it("picks the book opened last that is not finished", () => {
    expect(
      bookToContinue([
        doc("a", 10),
        doc("b", 30, 40, 1),
        doc("c", 20),
        doc("d", null),
      ])?.id,
    ).toBe("c");
  });
  it("has nothing to continue when nothing is being read", () => {
    expect(bookToContinue([doc("d", null), doc("b", 30, 40, 1)])).toBeNull();
  });
});
