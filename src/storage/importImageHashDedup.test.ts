import { describe, expect, it } from "vitest";
import { filterNewImageHashesForImportDate } from "./importImageHashDedup";

describe("filterNewImageHashesForImportDate", () => {
  it("returns all hashes when none recorded for that date", () => {
    expect(
      filterNewImageHashesForImportDate("2026-04-01", ["a", "b"], [{ importDate: "2026-03-01", imageHashes: ["x"] }])
    ).toEqual(["a", "b"]);
  });

  it("drops hashes already present on the same import date", () => {
    const snaps = [
      { importDate: "2026-04-01", imageHashes: ["dup", "old"] },
      { importDate: "2026-04-02", imageHashes: ["other"] }
    ];
    expect(filterNewImageHashesForImportDate("2026-04-01", ["dup", "new"], snaps)).toEqual(["new"]);
  });

  it("drops empty hash entries like the save path after Set+filter(Boolean)", () => {
    expect(filterNewImageHashesForImportDate("2026-04-01", ["ok", "", "x"], [])).toEqual(["ok", "x"]);
  });
});
