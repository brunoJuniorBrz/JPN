import { describe, expect, it } from "vitest";
import { planningExample } from "@/domain/planning-example";
import { generateStructure } from "@/domain/calculations/structure";
import { findPieces } from "./piece-search";

describe("piece search is UI-only and bounded", () => {
  const pieces = generateStructure(planningExample()).model!.pieces;

  it("matches IDs case-insensitively without changing the source", () => {
    const before = JSON.stringify(pieces);
    const result = findPieces(pieces, "t1-bs1");
    expect(result.total).toBe(1);
    expect(result.matches[0].id).toBe("T1-BS1");
    expect(JSON.stringify(pieces)).toBe(before);
  });

  it("supports category labels and limits giant option lists", () => {
    const all = findPieces(pieces, "", 12);
    expect(all.total).toBe(pieces.length);
    expect(all.matches.length).toBe(Math.min(12, pieces.length));
    const columns = findPieces(pieces, "PILARES", 3);
    expect(columns.total).toBeGreaterThan(0);
    expect(columns.matches.length).toBeLessThanOrEqual(3);
    expect(columns.matches.every(p => p.role === "column")).toBe(true);
  });

  it("does not fabricate a match for missing IDs", () => {
    expect(findPieces(pieces, "NOT-A-REAL-PIECE")).toEqual({ matches: [], total: 0 });
  });
});
