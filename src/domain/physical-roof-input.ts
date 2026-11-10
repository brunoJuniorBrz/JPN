/** Strict, locale-friendly entry format for physically surveyed XYZ vertices.
 * Units are millimetres; use a semicolon between coordinates so decimal comma
 * remains unambiguous. Closing vertex is added only after exact validation. */
export type RoofVertex=[number,number,number];
const maxCoordinateMm=1e7;
export function parseRoofVertices(value:string):RoofVertex[]{
  const lines=value.replace(/\r\n?/g,"\n").split("\n").map(s=>s.trim()).filter(Boolean);
  if(lines.length<3||lines.length>101)
    throw new Error("ROOF_VERTICES: informe 3 a 100 vértices XYZ em linhas separadas.");
  const points=lines.map((line,index)=>{
    const parts=line.split(";").map(s=>s.trim());
    if(parts.length!==3||parts.some(s=>!/^[+-]?\d+(?:[.,]\d+)?$/.test(s)||/^[+-]?[1-9]\d{0,2}\.\d{3}$/.test(s)))
      throw new Error("ROOF_VERTEX_FORMAT: linha "+(index+1)+" deve ter X; Y; Z em mm, separados por ponto e vírgula.");
    const numbers=parts.map(s=>Number(s.replace(",",".")));
    if(numbers.some(n=>!Number.isFinite(n)||Math.abs(n)>maxCoordinateMm))
      throw new Error("ROOF_VERTEX_RANGE: coordenadas devem ser finitas e limitadas a 10.000.000 mm.");
    return numbers as RoofVertex;
  });
  const first=points[0],last=points.at(-1)!;
  if(first.every((v,i)=>v===last[i]))return points;
  if(Math.hypot(...first.map((v,i)=>v-last[i]))<1e-3)
    throw new Error("ROOF_VERTEX_CLOSURE: ajuste o último vértice para coincidir exatamente com o primeiro.");
  if(points.length>100)throw new Error("ROOF_VERTEX_LIMIT: limite de 100 pontos antes de fechar.");
  return [...points,[...first] as RoofVertex];
}
export function parseRoofHoles(value:string):RoofVertex[][]{
  if(!value.trim())return [];
  const blocks=value.replace(/\r\n?/g,"\n").trim().split(/\n[ \t]*\n+/).filter(s=>s.trim());
  if(blocks.length>10)throw new Error("ROOF_HOLES_LIMIT: máximo dez recortes por pano.");
  return blocks.map(parseRoofVertices);
}
export function formatRoofVertices(ring:readonly RoofVertex[]):string{
  const closed=ring.length>1&&ring[0].every((v,i)=>v===ring.at(-1)![i]);
  return (closed?ring.slice(0,-1):ring).map(p=>p.join("; ")).join("\n");
}
export function formatRoofHoles(holes:readonly (readonly RoofVertex[])[]):string{
  return holes.map(formatRoofVertices).join("\n\n");
}
