import {expect,it} from "vitest";
import {DxfWriter} from "@tarikjabiri/dxf";
import {CadBook} from "./cad-book";

it("chooses the largest standard scale that actually fits a tall A3 plan",()=>{
  const book=new CadBook(new DxfWriter(),"A3","Tom","PRELIMINAR",new Date("2026-11-17T20:00:00.000Z"));
  const full={x:12,y:2,width:book.area.width-24,height:book.area.height-4};
  expect(book.scale(14500,9160,full)).toBe(50);
  // A 9.16 m roof rotated onto paper and scaled 1:50 fills >50% of
  // the real usable single-sheet area; 1:25 cannot fit either dimension.
  expect((14500/50)*(9160/50)/(book.area.width*book.area.height)).toBeGreaterThan(.5);
  expect(book.scale(14700,9400,full)).toBe(75);
  expect(book.scale(25100,3100,{x:0,y:0,width:210,height:100})).toBe(125);
});
