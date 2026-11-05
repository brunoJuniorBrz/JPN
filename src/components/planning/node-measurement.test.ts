import { expect, it } from "vitest";
import { calculateNodeMeasurement, nextMeasurementNode } from "./node-measurement";

const nodes = [
  { id: "A", x: 0, y: 0, z: 0 },
  { id: "B", x: 3000, y: 4000, z: 12000 },
  { id: "C", x: 6000, y: 4000, z: 12000 },
];

it("uses the source millimetre coordinates for the full 3D diagonal, signed components and no mutation", () => {
  const before = JSON.stringify(nodes);
  const result = calculateNodeMeasurement(nodes, ["A", "B"]);
  expect(result).toEqual({ from:"A",to:"B",dxMm:3000,dyMm:4000,dzMm:12000,lengthMm:13000 });
  expect(JSON.stringify(nodes)).toBe(before);
  expect(calculateNodeMeasurement(nodes, ["B","A"])).toMatchObject({lengthMm:13000,dxMm:-3000,dyMm:-4000,dzMm:-12000});
});
it("rejects missing, duplicate and degenerate endpoints", () => {
  expect(calculateNodeMeasurement(nodes, ["A"])).toBeNull();
  expect(calculateNodeMeasurement(nodes, ["A","A"])).toBeNull();
  expect(calculateNodeMeasurement(nodes, ["A","missing"])).toBeNull();
  expect(calculateNodeMeasurement([...nodes,{id:"D",x:0,y:0,z:0}],["A","D"])).toBeNull();
});
it("selects two nodes, ignores repeat of first node, and starts a new measurement after the second", () => {
  const one = nextMeasurementNode([], "A");
  expect(nextMeasurementNode(one,"A")).toEqual(["A"]);
  const two = nextMeasurementNode(one,"B");
  expect(two).toEqual(["A","B"]);
  expect(nextMeasurementNode(two,"C")).toEqual(["C"]);
  expect(nextMeasurementNode(["A","B"],"")).toEqual(["A","B"]);
});
