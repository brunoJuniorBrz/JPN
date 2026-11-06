"use client";
import type { ReactNode } from "react";

export function ChoiceCard({ active, title, description, onClick, children, testId }: {
  active: boolean; title: string; description?: string; onClick: () => void; children: ReactNode; testId?: string;
}) {
  return <button type="button" className={`guided-choice${active ? " is-selected" : ""}`} aria-pressed={active}
    onClick={onClick} data-testid={testId}>
    <span className="guided-choice-art" aria-hidden="true">{children}</span>
    <span className="guided-choice-content"><strong>{title}</strong>{description && <small>{description}</small>}</span>
    <span className="guided-choice-check" aria-hidden="true">{active ? "✓" : ""}</span>
  </button>;
}

export function RoofShapeIcon({ kind }: { kind: "mono" | "gable" }) {
  return <svg viewBox="0 0 170 78" fill="none" aria-hidden="true" className="guided-mini-illustration">
    <path d="M13 64H157" stroke="#c9d3ca" strokeWidth="2"/>
    <path d={kind === "mono" ? "M28 59V30L142 13V59" : "M28 59V34L85 11L142 34V59"}
      stroke="#60736b" strokeWidth="3" strokeLinejoin="round"/>
    <path d={kind === "mono" ? "M20 33L150 10" : "M20 36L85 9L150 36"} stroke="#338c78" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d={kind === "mono" ? "M28 42L142 26" : "M28 45L85 24L142 45"} stroke="#d7ab65" strokeWidth="2" strokeDasharray="4 4"/>
  </svg>;
}

export function EnclosureIcon({ kind }: { kind: "open" | "partial" | "closed" }) {
  return <svg viewBox="0 0 120 68" fill="none" aria-hidden="true" className="guided-mini-illustration">
    <path d="M15 24L60 7L105 24" stroke="#348d79" strokeWidth="5" strokeLinejoin="round"/>
    <path d="M23 26V59M97 26V59" stroke="#65736e" strokeWidth="3"/>
    {kind === "closed" && <path d="M24 30L60 14L96 30V58H24Z" fill="#aecbc0" fillOpacity=".65" stroke="#88a69c" strokeWidth="1.5"/>}
    {kind === "partial" && <path d="M24 42V58H96V42" fill="#aecbc0" fillOpacity=".65" stroke="#88a69c" strokeWidth="2"/>}
    <path d="M12 60H108" stroke="#cbd6ce" strokeWidth="2"/>
  </svg>;
}

export function SupportIcon({ kind }: { kind: "columns" | "walls" | "unspecified" }) {
  return <svg viewBox="0 0 120 68" fill="none" aria-hidden="true" className="guided-mini-illustration">
    <path d="M10 23L60 7L110 23" stroke="#348d79" strokeWidth="5" strokeLinejoin="round"/>
    {kind === "columns" && <path d="M19 25V60M101 25V60" stroke="#65736e" strokeWidth="6"/>}
    {kind === "walls" && <><rect x="14" y="26" width="15" height="34" rx="2" fill="#b5c1b9"/><rect x="91" y="26" width="15" height="34" rx="2" fill="#b5c1b9"/></>}
    {kind === "unspecified" && <><path d="M19 25V60M101 25V60" stroke="#abb8b0" strokeDasharray="4 4" strokeWidth="3"/><text x="60" y="50" fontSize="23" textAnchor="middle" fill="#8b9b90">?</text></>}
    <path d="M10 62H110" stroke="#d4dcd6" strokeWidth="2"/>
  </svg>;
}

export function ProfileIcon({ kind }: { kind: "unspecified" | "channel" | "lipped-channel" | "tube" }) {
  return <svg viewBox="0 0 110 68" fill="none" aria-hidden="true" className="guided-mini-illustration">
    {kind === "channel" && <path d="M35 12H75M35 12V56H75" stroke="#587c85" strokeWidth="7" strokeLinecap="square"/>}
    {kind === "lipped-channel" && <path d="M76 22V12H35V56H76V46" stroke="#587c85" strokeWidth="7" strokeLinecap="square"/>}
    {kind === "tube" && <rect x="34" y="13" width="45" height="43" rx="2" stroke="#587c85" strokeWidth="7"/>}
    {kind === "unspecified" && <><rect x="34" y="13" width="45" height="43" rx="5" stroke="#b3c6bc" strokeDasharray="5 5" strokeWidth="3"/><text x="56" y="44" fontSize="25" textAnchor="middle" fill="#8b9b90">?</text></>}
  </svg>;
}

export function TrussReferenceSketch() {
  return <svg viewBox="0 0 340 110" aria-label="Desenho didático de banzo, diagonal e montante" role="img" className="guided-truss-drawing">
    <path d="M13 85L170 15L327 85M13 85H327" stroke="#367b82" strokeWidth="5" fill="none" strokeLinejoin="round"/>
    <path d="M13 85L91 50L170 85L249 50L327 85" stroke="#d39b56" strokeWidth="3" fill="none"/>
    <path d="M91 50V85M170 15V85M249 50V85" stroke="#5c996c" strokeWidth="3"/>
    <text x="172" y="106" fontSize="10" textAnchor="middle" fill="currentColor">Banzos • diagonais • montantes</text>
  </svg>;
}

export function LiveRoofPreview({ typology, widthM, lengthM, heightM, frameSpacingM, purlinSpacingM }: {
  typology: "mono" | "gable"; widthM: number | null; lengthM: number | null; heightM: number | null; frameSpacingM: number; purlinSpacingM: number;
}) {
  const valid = widthM !== null && lengthM !== null && heightM !== null;
  const pitch = typology === "gable" ? "duas águas" : "uma água";
  const label = valid ? `${widthM} × ${lengthM} m · altura ${heightM} m` : "Aguardando medidas";
  const front = typology === "gable" ? "M70 193L155 146L240 193" : "M70 174L240 146";
  const back = typology === "gable" ? "M175 130L260 83L345 130" : "M175 111L345 83";
  const ribs = typology === "gable" ? [["70,193","175,130"],["155,146","260,83"],["240,193","345,130"]] : [["70,174","175,111"],["240,146","345,83"]];
  return <div className="guided-live-preview" data-testid="guided-live-preview">
    <div className="guided-preview-head"><span>VISÃO DE CONCEITO</span><span>Não dimensionado</span></div>
    <svg viewBox="0 0 430 270" role="img" aria-label={`Esquema em perspectiva de telhado de ${pitch}; ${label}`}>
      <defs><linearGradient id="roofFillPreview" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#bcdad0"/><stop offset="1" stopColor="#e8f1ec"/></linearGradient></defs>
      <path d="M48 229H370" stroke="#d5dfd7" strokeWidth="2"/>
      <path d="M70 193V233M240 193V233M175 130V171M345 130V171" stroke="#78908a" strokeWidth="5" fill="none" strokeLinecap="round"/>
      <path d={typology === "gable" ? "M70 193L155 146L240 193L345 130L260 83L175 130Z" : "M70 174L240 146L345 83L175 111Z"} fill="url(#roofFillPreview)" fillOpacity=".65"/>
      <path d={back} stroke="#7b9b90" strokeWidth="5" fill="none" strokeLinejoin="round"/>
      <path d={front} stroke="#308b79" strokeWidth="6" fill="none" strokeLinejoin="round"/>
      {ribs.map(([a,b],i)=><path key={i} d={`M${a}L${b}`} stroke="#a6bcb1" strokeWidth="2" fill="none"/>)}
      {typology === "gable" ? <>
        <path d="M70 193L155 193L240 193M70 193L155 146L240 193" stroke="#597d80" strokeWidth="2" strokeDasharray="5 4" fill="none"/>
        <path d="M155 146V193M114 169V193M198 170V193" stroke="#a0bbad" strokeWidth="2"/>
      </> : <path d="M70 174L155 160L240 146M70 174L155 187L240 146" stroke="#a0bbad" strokeWidth="2" fill="none"/>}
      <path d="M70 233L175 171M240 233L345 171" stroke="#c9d5cf" strokeDasharray="5 6"/>
      <text x="208" y="252" textAnchor="middle" fill="#50675d" fontSize="12" fontWeight="600">{label}</text>
    </svg>
    <div className="guided-preview-meta"><span><b>{pitch}</b><small>Formato</small></span><span><b>{frameSpacingM.toLocaleString("pt-BR")} m</b><small>Entre tesouras*</small></span><span><b>{purlinSpacingM.toLocaleString("pt-BR")} m</b><small>Entre terças*</small></span></div>
    <p>* Valores geométricos para pré-visualização, não dimensionamento. O desenho não representa a obra do Tom.</p>
  </div>;
}
