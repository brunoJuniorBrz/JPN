import {describe,expect,it} from "vitest";
import {formatRoofHoles,formatRoofVertices,parseRoofHoles,parseRoofVertices} from "./physical-roof-input";
import {physicalRoofFacesSchema} from "./physical-roof-faces";
const poly="0; 0; 3000\n4000; 0; 3400\n4000; 5000; 3400\n0; 5000; 3000";
describe("M39-P3: entrada de levantamento XYZ sem unidades presumidas",()=>{
  it("fecha contorno automaticamente, com coordenadas milimétricas auditáveis",()=>{
    const vertices=parseRoofVertices(poly);
    expect(vertices).toHaveLength(5);
    expect(vertices.at(-1)).toEqual([0,0,3000]);
    expect(formatRoofVertices(vertices)).toBe(poly);
  });
  it("aceita decimal brasileiro e preserva a orientação de contornos",()=>{
    const vertices=parseRoofVertices("0;0;3000,5\n4,5;0;3000,5\n4,5;2,5;3000,5");
    expect(vertices[1][0]).toBe(4.5);
    expect(vertices[1][1]).toBe(0);
    expect(vertices[1][2]).toBe(3000.5);
  });
  it("rejeita separador ambíguo, inf/nan e fechamento quase coincidente",()=>{
    expect(()=>parseRoofVertices("0,0,0\n2,0,0\n2,3,0")).toThrow("ROOF_VERTEX_FORMAT");
    expect(()=>parseRoofVertices("0;0;0\n4.000;0;0\n4;4;0")).toThrow("ROOF_VERTEX_FORMAT");
    expect(()=>parseRoofVertices("0;0;0\nNaN;0;0\n2;2;0")).toThrow("ROOF_VERTEX_FORMAT");
    expect(()=>parseRoofVertices("0;0;0\n4;0;0\n4;4;0\n0;0;0,0005")).toThrow("ROOF_VERTEX_CLOSURE");
  });
  it("constrói recortes separados por linha vazia e rejeita limite",()=>{
    const holes="1;1;3000\n1;2;3000\n2;1;3000\n\n3;3;3000\n3;4;3000\n4;3;3000";
    const parsed=parseRoofHoles(holes);
    expect(parsed).toHaveLength(2);
    expect(parsed.every(h=>h.length===4)).toBe(true);
    expect(parseRoofHoles(formatRoofHoles(parsed))).toEqual(parsed);
    expect(()=>parseRoofHoles(Array(11).fill("0;0;1\n2;0;1\n2;2;1").join("\n\n"))).toThrow("ROOF_HOLES_LIMIT");
  });
  it("integra parser com schema físico estrito e recusa orientação alterada",()=>{
    const outer=parseRoofVertices(poly);
    const base={schema_version:"jpn.physical-roof-faces/1",units:"mm",source:"Levantamento real",
      revision:"Revisão geométrica 1",faces:[{
        id:"PANO",outer,holes:[],supportPieceIds:["T1","T2"],
        source:"Levantamento real",revision:"Revisão geométrica 1",
      }]};
    expect(physicalRoofFacesSchema.parse(base).faces[0].outer).toHaveLength(5);
    expect(physicalRoofFacesSchema.safeParse({...base,faces:[{...base.faces[0],outer:[...outer].reverse()}]}).success).toBe(false);
  });
});
