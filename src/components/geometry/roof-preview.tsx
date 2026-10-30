"use client";
import { useRef, useState } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { PRELIMINARY_NOTICE, type GeometryModel, type ViewName } from "@/domain/calculations/geometry";

export function RoofPreview({ model }: { model: GeometryModel }) {
  const [view, setView] = useState<ViewName>("plan");
  return <section className="drawing-panel" aria-label="Desenho da cobertura"><div className="drawing-heading"><h3>Confira o desenho</h3><span>Revisão {model.revision} · mm</span></div><div className="view-switch" aria-label="Vistas do desenho">{([["plan", "De cima"], ["front", "De frente"], ["side", "De lado"]] as const).map(([key, label]) => <button key={key} type="button" className={key === view ? "selected" : ""} aria-pressed={key === view} onClick={() => setView(key)}>{label}</button>)}</div><DrawingCanvas key={view} model={model} view={view} /><p className="drawing-help">Arraste para mover. Use dois dedos ou os botões para ampliar.</p><p className="preliminary-banner">{PRELIMINARY_NOTICE}</p><p className="drawing-help">Círculos indicam somente apoios informados. Não representam pilares dimensionados.</p></section>;
}
export function DrawingCanvas({ model, view, selected, onSelect }: { model: GeometryModel; view: ViewName; selected?: string; onSelect?: (id: string) => void }) {
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const { bounds: b, entities } = model.views[view];
  const width = b.maxX - b.minX, height = b.maxY - b.minY;
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const changeZoom = (value: number) => setZoom(z => Math.min(8, Math.max(.5, z * value)));
  const color = { COBERTURA: "#343d32", EIXOS: "#91a18a", APOIOS: "#8f672b", COTAS: "#5b7379", TEXTOS: "#65603b", PILARES: "#8f672b", TERCAS: "#357989", TESOURAS: "#343d32" };
  return <><div className="drawing-toolbar"><button type="button" className="button secondary" aria-label="Diminuir desenho" onClick={() => changeZoom(1 / 1.25)}><Minus size={18} /></button><button type="button" className="button secondary" aria-label="Ampliar desenho" onClick={() => changeZoom(1.25)}><Plus size={18} /></button><button type="button" className="button secondary" onClick={reset}><Maximize size={18} />Ajustar à tela</button></div><svg ref={svg} role="img" aria-label={`Desenho preliminar: ${view === "plan" ? "planta" : view === "front" ? "frente" : "lateral"}`} className="roof-svg" viewBox={`${b.minX - pan.x + width * (1 - 1 / zoom) / 2} ${-b.maxY - pan.y + height * (1 - 1 / zoom) / 2} ${width / zoom} ${height / zoom}`} onPointerDown={e => {
    e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }} onPointerMove={e => {
    const previous = pointers.current.get(e.pointerId); if (!previous) return;
    const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (other) {
      const before = Math.hypot(previous.x - other.x, previous.y - other.y), after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0) changeZoom(after / before);
    } else {
      const rect = svg.current!.getBoundingClientRect();
      const scale = Math.min(rect.width / (width / zoom), rect.height / (height / zoom));
      setPan(p => ({ x: p.x + (e.clientX - previous.x) / scale, y: p.y + (e.clientY - previous.y) / scale }));
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }} onPointerUp={e => pointers.current.delete(e.pointerId)} onPointerCancel={e => pointers.current.delete(e.pointerId)}>
    {entities.map((entity, i) => entity.type === "line" ? <line key={i} x1={entity.a.x} y1={-entity.a.y} x2={entity.b.x} y2={-entity.b.y} onClick={() => { if (entity.pieceId) onSelect?.(entity.pieceId); }} stroke={entity.pieceId === selected ? "#d25d19" : color[entity.layer]} strokeWidth={entity.pieceId === selected ? 5 : entity.pieceId ? 3 : entity.layer === "COBERTURA" ? 2 : 1} vectorEffect="non-scaling-stroke" strokeDasharray={entity.layer === "EIXOS" ? "5 5" : undefined} /> : entity.type === "circle" ? <circle key={i} cx={entity.at.x} cy={-entity.at.y} r={entity.radius} onClick={() => { if (entity.pieceId) onSelect?.(entity.pieceId); }} stroke={entity.pieceId === selected ? "#d25d19" : color[entity.layer]} fill={entity.pieceId === selected ? "#ffdfb0" : "#fff7df"} strokeWidth={2} vectorEffect="non-scaling-stroke" /> : <text key={i} x={entity.at.x} y={-entity.at.y} fill={color[entity.layer]} fontSize={entity.height} textAnchor="middle">{entity.text}</text>)}
  </svg></>;
}
