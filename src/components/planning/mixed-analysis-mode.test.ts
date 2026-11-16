import { expect, it } from "vitest";
import { observedTranslationRatio } from "./mixed-analysis-mode";

it("computes only the observed geometric ratio without inventing an NBR limit", () => {
  expect(observedTranslationRatio([{ x_m: 0, y_m: 0, z_m: 0 }, { x_m: 0, y_m: 0, z_m: 4 }], {
    base: { translation_m: [0, 0, 0] }, top: { translation_m: [.003, .004, 0] },
  })).toBeCloseTo(.005 / 4, 12);
});
it("does not normalize against invented dimensions or publish nonfinite values", () => {
  expect(observedTranslationRatio([], {})).toBeNull();
  expect(observedTranslationRatio([{ x_m: 0, y_m: 0, z_m: 0 }], { A: { translation_m: [1, 0, 0] } })).toBeNull();
  expect(observedTranslationRatio([{ x_m: 0, y_m: 0, z_m: 0 }, { x_m: 0, y_m: 0, z_m: 4 }], { A: { translation_m: [NaN, 0, 0] } })).toBeNull();
});
