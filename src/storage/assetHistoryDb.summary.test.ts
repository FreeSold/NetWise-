import { describe, expect, it } from "vitest";
import type { ParsedAsset } from "../domain/types";
import {
  combinedSummaryFromSnapshotList,
  resolveSnapshotBucketIdFromParseResult,
  type SnapshotRecord
} from "./assetHistoryDb";

function asset(
  name: string,
  amount: number,
  source: ParsedAsset["source"],
  assetClass: ParsedAsset["assetClass"] = "cash"
): ParsedAsset {
  return {
    name,
    amount,
    currency: "CNY",
    assetClass,
    source,
    confidence: 1,
    recognizedLabel: name
  };
}

describe("resolveSnapshotBucketIdFromParseResult", () => {
  it("uses builtin screen type when known", () => {
    expect(
      resolveSnapshotBucketIdFromParseResult({
        screenType: "alipay_wealth",
        assets: [],
        warnings: []
      })
    ).toBe("alipay_wealth");
  });

  it("uses first custom module id on unknown + customModuleIds", () => {
    expect(
      resolveSnapshotBucketIdFromParseResult({
        screenType: "unknown",
        customModuleIds: ["mod-a", "mod-b"],
        assets: [],
        warnings: []
      })
    ).toBe("mod-a");
  });

  it("falls back to unknown", () => {
    expect(
      resolveSnapshotBucketIdFromParseResult({
        screenType: "unknown",
        assets: [],
        warnings: []
      })
    ).toBe("unknown");
  });
});

describe("combinedSummaryFromSnapshotList", () => {
  it("takes latest per platform by importDate then id", () => {
    const older: SnapshotRecord = {
      id: 1,
      importDate: "2026-01-01",
      imageHashes: ["a"],
      assets: [asset("a", 100, "alipay_wealth")],
      assetBuckets: [{ bucketId: "alipay_wealth", assets: [asset("a", 100, "alipay_wealth")] }]
    };
    const newer: SnapshotRecord = {
      id: 2,
      importDate: "2026-01-02",
      imageHashes: ["b"],
      assets: [asset("b", 250, "alipay_wealth")],
      assetBuckets: [{ bucketId: "alipay_wealth", assets: [asset("b", 250, "alipay_wealth")] }]
    };
    const { total, byClass } = combinedSummaryFromSnapshotList([older, newer], [], "all");
    expect(total).toBe(250);
    expect(byClass.cash).toBe(250);
  });

  it("sums latest snapshot per platform independently", () => {
    const alipay: SnapshotRecord = {
      id: 1,
      importDate: "2026-01-10",
      imageHashes: ["x"],
      assets: [asset("yeb", 1000, "alipay_wealth")],
      assetBuckets: [{ bucketId: "alipay_wealth", assets: [asset("yeb", 1000, "alipay_wealth")] }]
    };
    const cmb: SnapshotRecord = {
      id: 2,
      importDate: "2026-01-10",
      imageHashes: ["y"],
      assets: [asset("活期", 500, "cmb_property")],
      assetBuckets: [{ bucketId: "cmb_property", assets: [asset("活期", 500, "cmb_property")] }]
    };
    const { total } = combinedSummaryFromSnapshotList([alipay, cmb], [], "all");
    expect(total).toBe(1500);
  });

  it("uses custom module bucket from latest qualifying snapshot", () => {
    const modId = "m-stock";
    const older: SnapshotRecord = {
      id: 1,
      importDate: "2026-02-01",
      imageHashes: ["a"],
      assets: [],
      assetBuckets: [{ bucketId: modId, assets: [asset("x", 10, "custom", "stock")] }],
      ocrTexts: ["关键词A"]
    };
    const newer: SnapshotRecord = {
      id: 2,
      importDate: "2026-02-05",
      imageHashes: ["b"],
      assets: [],
      assetBuckets: [{ bucketId: modId, assets: [asset("x", 99, "custom", "stock")] }],
      ocrTexts: ["关键词A"]
    };
    const { total, byClass } = combinedSummaryFromSnapshotList([older, newer], [{ id: modId, keywords: ["关键词A"] }], "all");
    expect(byClass.stock).toBe(99);
    expect(total).toBe(99);
  });
});
