"use client";
import { useMemo, useState } from "react";
import type { Project } from "@/domain/models";
import { physicalRoleLabels as roleLabels,physicalRoles as pieceRoles } from "@/domain/structure";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { NumberField } from "@/components/number-field";
import { useData } from "@/components/data-provider";
import { downloadText } from "@/lib/format";
import { structureSignature } from "@/domain/calculations/project-basis";
import {
  dofNames, emptyPhysicalGroup, emptyPhysicalLoad, newSpatialPreparation,
  spatialPreparationReview, type PhysicalGroup, type SpatialPreparation,
} from "@/domain/spatial-preparation";
import type { Material } from "@/domain/models";
import { SpatialAdapterPanel } from "./spatial-adapter-panel";
import { mixedPreparationReview } from "@/domain/mixed-adapter";
import { MemberPhysicalCatalogPanel } from "./member-physical-catalog-panel";
import { SupportInterfaceEditor } from "./support-interface-editor";
import { PhysicalRoofWorkflow } from "./physical-roof-workflow";

const numberFields = [
  ["eGpa", "Elasticidade E (GPa)"], ["gGpa", "Cisalhamento G (GPa)"],
  ["areaCm2", "Área A (cm²)"], ["iyCm4", "Inércia Iy (cm⁴)"],
  ["izCm4", "Inércia Iz (cm⁴)"], ["jCm4", "Torção J (cm⁴)"],
] as const;
const forces = [
  ["fxKn", "Fx (kN)"], ["fyKn", "Fy (kN)"], ["fzKn", "Fz (kN)"],
  ["mxKnm", "Mx (kN·m)"], ["myKnm", "My (kN·m)"], ["mzKnm", "Mz (kN·m)"],
] as const;
const presets = {
  fixed: ["fixed", "fixed", "fixed", "fixed", "fixed", "fixed"],
  pinned: ["fixed", "fixed", "fixed", "free", "free", "free"],
} as const;
type SupportState = "pending" | "free" | "fixed";
const supportChoices: { value: SupportState; label: string }[] = [
  { value: "pending", label: "Pendente" }, { value: "free", label: "Livre" }, { value: "fixed", label: "Restrito (zero)" },
];
function SignedNumber({ label, value, onChange, limit = 1e9 }: { label: string; value: number | null; onChange: (v: number | null) => void; limit?: number }) {
  const [entry, setEntry] = useState(value === null ? "" : String(value).replace(".", ","));
  const [focused, setFocused] = useState(false);
  const valid = !entry || (/^-?\d+(?:[.,]\d+)?$/.test(entry) && Number.isFinite(Number(entry.replace(",", "."))) && Math.abs(Number(entry.replace(",", "."))) <= limit);
  return <Field label={label} error={!valid && focused ? "Informe um valor com sinal, ou zero." : undefined}><Input
    inputMode="decimal" value={focused ? entry : value === null ? "" : String(value).replace(".", ",")}
    onFocus={() => { setFocused(true); setEntry(value === null ? "" : String(value).replace(".", ",")); }}
    onBlur={() => setFocused(false)}
    onChange={e => { const next = e.target.value; setEntry(next); onChange(/^-?\d+(?:[.,]\d+)?$/.test(next) && Number.isFinite(Number(next.replace(",", "."))) && Math.abs(Number(next.replace(",", "."))) <= limit ? Number(next.replace(",", ".")) : null); }}
  /></Field>;
}
function selectCaseName(cases: readonly { id: string }[], prefix: string) {
  const ids = new Set(cases.map(c => c.id));
  for (let i = 1; i <= 100; i++) if (!ids.has(`${prefix}-${i}`)) return `${prefix}-${i}`;
  return "";
}
function catalogueGroup(material: Material): PhysicalGroup | null {
  if (material.isExample) return null;
  // A catalogue section does not prescribe connection stiffness or local roll
  // in another structure. Both must be explicitly reviewed in each project.
  if (material.physicalDeclaration) return { ...structuredClone(material.physicalDeclaration), connection: "pending", rotationDeg: null };
  const profile = material.technicalProfile;
  if (!profile) return null;
  const d = profile.data;
  const source = profile.source.trim();
  // Only copy declared, explicitly sourced properties. G and J do not exist
  // in the old catalogue, so those MUST remain pending.
  return { ...emptyPhysicalGroup(),
    steelGrade: profile.steelGrade, materialSource: source, materialRevision: d?.sourceDate ?? "",
    eGpa: source && d?.elasticModulusGpa ? d.elasticModulusGpa : null,
    areaCm2: source && d?.areaCm2 ? d.areaCm2 : null,
    iyCm4: source && d?.iyCm4 ? d.iyCm4 : null, izCm4: source && d?.izCm4 ? d.izCm4 : null,
    sectionSource: source, sectionRevision: d?.sourceDate ?? "" };
}
export function SpatialPreparationPanel({ project, onChange, initialSection = "profiles", onOpenSpatial, mixed = false }: { project: Project; onChange: (patch: Partial<Project>) => void; initialSection?: "profiles" | "supports" | "loads" | "review"; onOpenSpatial?: () => void; mixed?: boolean }) {
  const { data, saveMaterial } = useData();
  const draft = project.workspace.spatialPreparation ?? newSpatialPreparation(project);
  const review = useMemo(() => mixed ? mixedPreparationReview(project, draft, !!draft.loading) : spatialPreparationReview(project, draft), [project, draft, mixed]);
  const [role, setRole] = useState<(typeof pieceRoles)[number]>("column");
  const [support, setSupport] = useState("");
  const [node, setNode] = useState("");
  const [bulk, setBulk] = useState("");
  const [catalogueTarget, setCatalogueTarget] = useState("");
  const [caseForLoad, setCaseForLoad] = useState("");
  const [memberId, setMemberId] = useState("");
  const [section, setSection] = useState<"profiles" | "supports" | "loads" | "review">(initialSection);
  const [notice, setNotice] = useState("");
  const groupFor=(key:typeof pieceRoles[number])=>draft.groups[key]??emptyPhysicalGroup();
  const currentRole = groupFor(role);
  const needsBending = !mixed || currentRole.elementKind !== "axial" || draft.memberKinds?.some(m => m.kind === "frame" && review.geometry?.pieces.some(p => p.id === m.pieceId && p.role === role));
  const nodes = review.geometry?.nodes ?? [];
  const base = review.base;
  const supportNodes = mixed ? nodes.map(n => n.id) : base;
  const selectedBase = supportNodes.includes(support) ? support : draft.supports.find(s => supportNodes.includes(s.nodeId))?.nodeId ?? base[0] ?? supportNodes[0] ?? "";
  const selectedNode = nodes.some(n => n.id === node) ? node : nodes[0]?.id ?? "";
  const selectedCase = draft.cases.some(c => c.id === caseForLoad) ? caseForLoad : draft.cases[0]?.id ?? "";
  const selectedMember = review.geometry?.pieces.find(p => p.id === memberId) ?? review.geometry?.pieces[0];
  const memberOverride = draft.memberConnections.find(v => v.pieceId === selectedMember?.id);
  const existingSupport = draft.supports.find(s => s.nodeId === selectedBase);
  const emptyDofs: SupportState[] = ["pending", "pending", "pending", "pending", "pending", "pending"];
  const supportDofs = existingSupport?.dofs ?? emptyDofs;

  function change(next: SpatialPreparation) {
    onChange({ workspace: { ...project.workspace, spatialPreparation: next } }); setNotice("");
  }
  function group(patch: Partial<PhysicalGroup>) { change({ ...draft, groups: { ...draft.groups, [role]: { ...currentRole, ...patch } } }); }
  function writeSupport(nodeId: string, states: SupportState[]) {
    if (!nodeId) return;
    const value = { nodeId, dofs: states as SpatialPreparation["supports"][number]["dofs"] };
    change({ ...draft, supports: [...draft.supports.filter(s => s.nodeId !== nodeId), value] });
  }
  function changeMemberEnd(end: "start" | "end", value: SpatialPreparation["memberConnections"][number]["start"]) {
    if (!selectedMember) return;
    const next: SpatialPreparation["memberConnections"][number] = {
      pieceId: selectedMember.id, start: memberOverride?.start ?? "inherit", end: memberOverride?.end ?? "inherit",
    };
    next[end] = value;
    change({ ...draft, memberConnections: [
      ...draft.memberConnections.filter(v => v.pieceId !== selectedMember.id),
      ...(next.start === "inherit" && next.end === "inherit" ? [] : [next]),
    ] });
  }
  function updateLoad(id: string, patch: Partial<SpatialPreparation["loads"][number]>) {
    change({ ...draft, loads: draft.loads.map(l => l.id === id ? { ...l, ...patch } : l) });
  }
  return <section className="physical-prep" aria-label="Preparar análise estrutural">
    <h3>Preparar análise estrutural</h3>
    <p>Preencha somente dados conhecidos e revisados. A estrutura 3D continua disponível imediatamente; nenhum perfil, apoio, ligação ou carregamento será presumido pelo sistema.</p>
    <div className="notice" data-testid="physical-prep-status">
      <strong>{review.stale ? "Cadastro desatualizado" : review.issues.length ? "Preparação em andamento" : mixed ? "Declarações conferidas; análise ainda não executada" : "Declarações preenchidas; aguarda adaptador físico"}</strong>
      <p>{review.geometry ? `${review.geometry.pieces.length} peças · ${nodes.length} nós · ${base.length} bases de pilares.` : "Geometria visual incompleta."} Nenhum dado deste painel libera dimensionamento ou fabricação.</p>
      <p><strong>{review.issues.length} pendências</strong> · {review.contacts.length} encontros geométricos aparentes; a conferência física é feita no adaptador.</p>
      {review.stale && <button type="button" className="button secondary" onClick={() => { change({ ...draft, geometrySignature: structureSignature(project) }); setNotice("Vínculo geométrico atualizado. Revise apoios, cargas e conexões com os novos nós."); }}>Reconhecer nova geometria (sem apagar dados)</button>}
    </div>
    <nav className="physical-prep-tabs" aria-label="Etapas da preparação">
      {([["profiles", "1. Aço e seções"], ["supports", "2. Apoios e ligações"], ["loads", "3. Cargas e combinações"], ["review", "4. Conferência"]] as const).map(([key, label]) =>
        <button type="button" key={key} className={section === key ? "button" : "button secondary"} aria-pressed={section === key} onClick={() => setSection(key)}>{label}</button>)}
    </nav>
    {section === "profiles" && <>
      {mixed&&<MemberPhysicalCatalogPanel project={project} draft={draft} onChange={change}/>}
      <h4>Especificar propriedades por grupo</h4><p className="field-hint">Esses campos são físicos, separados das seções de visualização. Um valor sem fonte não é considerado especificado.</p>
      <Field label="Grupo de peças"><Select value={role} onChange={e => setRole(e.target.value as typeof role)}>
        {pieceRoles.map(key => <option key={key} value={key}>{roleLabels[key]}</option>)}
      </Select></Field>
      <div className="form-grid">
        <Field label="Copiar dados declarados de outro grupo"><Select value="" onChange={e => { const source = draft.groups[e.target.value as typeof role]; if (source) group({ ...source }); }}>
          <option value="">Escolher grupo</option>{pieceRoles.filter(k => k !== role).map(k => <option value={k} key={k}>{roleLabels[k]}</option>)}</Select></Field>
        {mixed && <Field label="Tipo físico do grupo"><Select value={currentRole.elementKind ?? "pending"} onChange={e => group({ elementKind: e.target.value === "pending" ? undefined : e.target.value as "frame" | "axial" })}><option value="pending">Não declarado</option><option value="frame">Pórtico Euler–Bernoulli</option><option value="axial">Barra exclusivamente axial</option></Select></Field>}
        <Field label="Copiar catálogo técnico existente"><Select value="" onChange={e => { const material = data.materials.find(m => m.id === e.target.value); const copy = material && catalogueGroup(material); if (copy) group({ ...copy, elementKind: currentRole.elementKind }); }}>
          <option value="">Escolher perfil (dados faltantes continuam vazios)</option>
          {data.materials.filter(m => !m.isExample && (m.technicalProfile || m.physicalDeclaration)).map(m => <option value={m.id} key={m.id}>{m.name}</option>)}
        </Select></Field>
        <Field label="Classe do aço"><Input value={currentRole.steelGrade} maxLength={1000} onChange={e => group({ steelGrade: e.target.value })}/></Field>
        <Field label="Fonte do material / fabricante"><Input value={currentRole.materialSource} maxLength={1000} onChange={e => group({ materialSource: e.target.value })}/></Field>
        <Field label="Data / revisão do material"><Input value={currentRole.materialRevision} maxLength={1000} onChange={e => group({ materialRevision: e.target.value })}/></Field>
        {numberFields.filter(([key]) => needsBending || key === "eGpa" || key === "areaCm2").map(([key, label]) => <NumberField key={role + key} label={label} min={0.000000001} max={1e9} decimals={9} value={currentRole[key]} onChange={value => group({ [key]: value })} />)}
        {needsBending && <NumberField key={role + "nu"} label="Poisson ν" min={-.99} max={.499} decimals={6} value={currentRole.nu} onChange={nu => group({ nu })} />}
        {needsBending && <NumberField key={role + "orientation"} label="Giro local físico (graus)" min={-360} max={360} decimals={3} value={currentRole.rotationDeg} onChange={rotationDeg => group({ rotationDeg })} hint="Não usar automaticamente o giro da seção visual."/>}
        <Field label="Fonte da seção / catálogo"><Input value={currentRole.sectionSource} maxLength={1000} onChange={e => group({ sectionSource: e.target.value })}/></Field>
        <Field label="Data / revisão da seção"><Input value={currentRole.sectionRevision} maxLength={1000} onChange={e => group({ sectionRevision: e.target.value })}/></Field>
      </div>
      <p className="field-hint">{needsBending ? "A, Iy, Iz e J precisam corresponder à seção real e à convenção dos eixos. A compatibilidade de E/G/ν é conferida na lista de pendências." : "Grupo exclusivamente axial: E e A com fontes/revisões; G, ν, inércias, torção e giro não participam da formulação. Uma peça de pórtico neste grupo volta a exigir esses dados."}</p>
      <div className="physical-catalogue">
        <h4>Reutilizar no catálogo</h4>
        <p className="field-hint">Guarda estes dados declarados em um material já cadastrado. Campos incompletos continuam pendentes e nenhuma propriedade é certificada.</p>
        <Field label="Material existente para guardar a declaração"><Select value={catalogueTarget} onChange={e => setCatalogueTarget(e.target.value)}><option value="">Selecione um material existente</option>{data.materials.filter(m => !m.isExample).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
        <button type="button" className="button secondary" disabled={!catalogueTarget} onClick={() => { const material = data.materials.find(m => m.id === catalogueTarget); if (material && saveMaterial({ ...material, physicalDeclaration: { ...structuredClone(currentRole), connection: "pending", rotationDeg: null } })) setNotice("Declaração física guardada no material selecionado. Confira as fontes antes de reutilizar."); }}>Guardar declaração física no catálogo</button>
      </div>
    </>}
    {section === "supports" && <>
      <h4>{mixed ? "Apoios nos nós físicos" : "Apoios nas bases"}</h4><p className="field-hint">Declare os vínculos dos nós reais; nenhum pilar, parede ou viga de concreto é considerado engastado automaticamente. Valores pendentes bloqueiam a análise.</p>
      {supportNodes.length ? <>
        <div className="form-grid">
          <Field label={mixed ? "Nó do apoio misto" : "Base do pilar"}><Select value={selectedBase} onChange={e => setSupport(e.target.value)}>{supportNodes.map(id => <option key={id} value={id}>{id}</option>)}</Select></Field>
          {base.length > 0 && <Field label="Modelo de apoio para todas as bases"><Select value={bulk} onChange={e => setBulk(e.target.value)}><option value="">Selecione para aplicar explicitamente</option><option value="fixed">Seis graus restritos (hipótese de engaste)</option><option value="pinned">Translações restritas; rotações livres (hipótese de articulação)</option></Select></Field>}
        </div>
        {base.length > 0 && <div className="actions"><button type="button" className="button secondary" disabled={!bulk} onClick={() => {
          const preset = presets[bulk as keyof typeof presets];
          if (!preset) return;
          change({ ...draft, supports: [...draft.supports.filter(s => !base.includes(s.nodeId)), ...base.map(nodeId => ({ nodeId, dofs: [...preset] as SpatialPreparation["supports"][number]["dofs"] }))] });
        }}>Aplicar hipótese escolhida às {base.length} bases</button></div>}
        <div className="physical-dofs">
          {dofNames.map((d, i) => <Field key={selectedBase + d} label={`${selectedBase} · ${d}`}><Select value={supportDofs[i]} onChange={e => {
            const updated = [...supportDofs] as SupportState[]; updated[i] = e.target.value as SupportState; writeSupport(selectedBase, updated);
          }}>{supportChoices.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>)}
        </div>
      </> : <p className="notice">Não há nós disponíveis para declarar apoios. Revise a geometria.</p>}
      {mixed && <SupportInterfaceEditor draft={draft} onChange={change}/>}
      <h4>Comportamento das ligações</h4><p className="field-hint">{mixed ? "O tipo físico é declarado separadamente. Uma extremidade articulada não transforma pórtico em axial. Axiais exigem ambas as extremidades axiais; contradições bloqueiam a execução." : "Hipóteses por grupo, editáveis. Ligações axiais/mistas ainda não são interpretadas pelo solver 3D; a missão de conectividade continua necessária."}</p>
      <div className="form-grid">
        {pieceRoles.map(key => <Field label={roleLabels[key]} key={key}><Select value={groupFor(key).connection}
          onChange={e => change({ ...draft, groups: { ...draft.groups, [key]: { ...groupFor(key), connection: e.target.value as PhysicalGroup["connection"] } } })}>
          <option value="pending">Não declarada</option><option value="rigid">Rígida (hipótese declarada)</option>
          <option value="pinned">Articulada (hipótese declarada)</option>{mixed&&<option value="bending-pinned">Articulada à flexão; torção contida, declarada</option>}<option value="axial">{mixed ? "Axial — sem transferência de momentos" : "Axial/treliça (adaptador futuro)"}</option>
        </Select></Field>)}
      </div>
      <h4>Ajustar ligação de uma peça individual</h4>
      <p className="field-hint">Uma peça pode ter ligação diferente no início e no fim. `Usar grupo` herda a hipótese do grupo; não significa vínculo validado. Recalcule as hipóteses depois de mudar a geometria.</p>
      {selectedMember && <>
        <Field label="Peça para revisar extremidades"><Select value={selectedMember.id} onChange={e => setMemberId(e.target.value)}>{review.geometry!.pieces.map(p => <option key={p.id} value={p.id}>{p.id} · {roleLabels[p.role]}</option>)}</Select></Field>
        {mixed && <Field label="Tipo físico desta peça"><Select value={draft.memberKinds?.find(m => m.pieceId === selectedMember.id)?.kind ?? "inherit"} onChange={e => change({ ...draft, memberKinds: [...(draft.memberKinds ?? []).filter(m => m.pieceId !== selectedMember.id), ...(e.target.value === "inherit" ? [] : [{ pieceId: selectedMember.id, kind: e.target.value as "frame" | "axial" }])] })}><option value="inherit">Usar tipo do grupo ({groupFor(selectedMember.role).elementKind ?? "pendente"})</option><option value="frame">Pórtico Euler–Bernoulli</option><option value="axial">Barra exclusivamente axial</option></Select></Field>}
        <div className="form-grid">
          {(["start", "end"] as const).map(end => <Field key={selectedMember.id + end} label={end === "start" ? "Ligação da extremidade inicial" : "Ligação da extremidade final"}><Select value={memberOverride?.[end] ?? "inherit"} onChange={e => changeMemberEnd(end, e.target.value as SpatialPreparation["memberConnections"][number]["start"])}>
            <option value="inherit">Usar grupo ({groupFor(selectedMember.role).connection})</option>
            <option value="pending">Pendente</option><option value="rigid">Rígida, declarada</option>
            <option value="pinned">Articulada, declarada</option>{mixed&&<option value="bending-pinned">Articulada à flexão; torção contida, declarada</option>}<option value="axial">{mixed ? "Axial, declarada" : "Axial/treliça (adaptador futuro)"}</option>
          </Select></Field>)}
        </div>
        <p className="field-hint">{draft.memberConnections.length} peças possuem exceções declaradas no cadastro.</p>
      </>}
      <Field label="Revisão de ligações e justificativa"><Textarea rows={3} value={draft.connectionsReview} onChange={e => change({ ...draft, connectionsReview: e.target.value })} maxLength={1000}/></Field>
      <Field label="Sistema de estabilidade lateral"><Textarea rows={3} value={draft.lateralSystem} onChange={e => change({ ...draft, lateralSystem: e.target.value })} maxLength={1000}/></Field>
    </>}
    {section === "loads" && <>
      <h4>Casos de carga</h4><p className="field-hint">O sistema não gera vento, peso próprio ou sobrecargas por conta própria. Cada força deve ter origem definida e seis componentes explícitas, inclusive os zeros.</p>
      {draft.cases.map(c => <div className="physical-row" key={c.id}><strong>{c.id}</strong><Field label={`Fonte e hipótese de ${c.id}`}><Input value={c.source} maxLength={1000} onChange={e => change({ ...draft, cases: draft.cases.map(item => item.id === c.id ? { ...item, source: e.target.value } : item) })}/></Field>
        <button type="button" className="button secondary" disabled={draft.cases.length <= 1} onClick={() => change({ ...draft, cases: draft.cases.filter(x => x.id !== c.id), loads: draft.loads.filter(l => l.caseId !== c.id), combinations: draft.combinations.map(combo => ({ ...combo, factors: Object.fromEntries(Object.entries(combo.factors).filter(([id]) => id !== c.id)) })) })}>Excluir caso e suas cargas</button></div>)}
      <button type="button" className="button secondary" disabled={draft.cases.length >= 10} onClick={() => {
        const id = selectCaseName(draft.cases, "CASO"); if (!id) return;
        change({ ...draft, cases: [...draft.cases, { id, source: "" }], combinations: draft.combinations.map(c => ({ ...c, factors: { ...c.factors, [id]: null } })) });
      }}>Adicionar caso</button>
      {mixed && project.workspace.physicalStructure && <PhysicalRoofWorkflow project={project} draft={draft} onChange={change}/>} 
      <h4>Forças e momentos nos nós</h4>
      {nodes.length > 0 && <div className="physical-row">
        <Field label="Nó do modelo"><Select value={selectedNode} onChange={e => setNode(e.target.value)}>{nodes.map(n => <option value={n.id} key={n.id}>{n.id} · {Math.round(n.x)}/{Math.round(n.y)}/{Math.round(n.z)} mm</option>)}</Select></Field>
        <Field label="Caso de carga"><Select value={selectedCase} onChange={e => setCaseForLoad(e.target.value)}>{draft.cases.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}</Select></Field>
        <button type="button" className="button secondary" disabled={draft.loads.length >= 500} onClick={() => change({ ...draft, loads: [...draft.loads, emptyPhysicalLoad(selectedCase, selectedNode)] })}>Adicionar carga nodal</button>
      </div>}
      {draft.loads.map((load, index) => <details key={load.id} className="technical-details">
        <summary>Carga {index + 1} · {load.nodeId} · {load.caseId} {forces.some(([key]) => load[key] === null) ? "· incompleta" : ""}</summary>
        <div className="form-grid">
          <Field label={`Nó da carga ${index + 1}`}><Select value={load.nodeId} onChange={e => updateLoad(load.id, { nodeId: e.target.value })}>{!nodes.some(n => n.id === load.nodeId) && <option value={load.nodeId}>{load.nodeId} (nó não encontrado)</option>}{nodes.map(n => <option value={n.id} key={n.id}>{n.id}</option>)}</Select></Field>
          <Field label={`Caso da carga ${index + 1}`}><Select value={load.caseId} onChange={e => updateLoad(load.id, { caseId: e.target.value })}>{draft.cases.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}</Select></Field>
          {forces.map(([key, label]) => <SignedNumber key={load.id + key} label={label} value={load[key]} onChange={value => updateLoad(load.id, { [key]: value })}/>)}
        </div><button type="button" className="button secondary" onClick={() => change({ ...draft, loads: draft.loads.filter(l => l.id !== load.id) })}>Remover carga</button>
      </details>)}
      <h4>Combinações</h4><p className="field-hint">Fatores devem ser informados pelo responsável técnico. Zero é explícito; vazio significa pendente.</p>
      {draft.combinations.map(combo => <details className="technical-details" key={combo.id} open={draft.combinations.length === 1 || undefined}><summary>{combo.id}</summary>
        <div className="form-grid">{draft.cases.map(c => <SignedNumber key={combo.id + c.id} label={`Fator ${c.id} em ${combo.id}`} limit={100} value={combo.factors[c.id] ?? null} onChange={value => change({ ...draft, combinations: draft.combinations.map(item => item.id === combo.id ? { ...item, factors: { ...item.factors, [c.id]: value } } : item) })}/>)}</div>
        <button type="button" className="button secondary" disabled={draft.combinations.length <= 1} onClick={() => change({ ...draft, combinations: draft.combinations.filter(c => c.id !== combo.id) })}>Excluir combinação</button>
      </details>)}
      <button type="button" className="button secondary" disabled={draft.combinations.length >= 10} onClick={() => {
        const id = selectCaseName(draft.combinations, "COMB"); if (id) change({ ...draft, combinations: [...draft.combinations, { id, factors: Object.fromEntries(draft.cases.map(c => [c.id, null])) }] });
      }}>Adicionar combinação</button>
      <Field label="Revisão do caminho de cargas até os apoios"><Textarea rows={3} maxLength={1000} value={draft.loadPathReview} onChange={e => change({ ...draft, loadPathReview: e.target.value })}/></Field>
    </>}
    {section === "review" && <>
      {!mixed && <SpatialAdapterPanel project={project} draft={draft} onChange={change}/>}
      <h4>Pendências para análise estrutural</h4>
      <p className="field-hint">{mixed ? "Esta conferência valida preenchimento, tipos físicos e conectividade declarada. Execute o processo Python local para verificar estabilidade e equilíbrio; não há aprovação de resistência ou dimensionamento." : "Esta conferência avalia o preenchimento e a topologia aparente; não aprova vínculos, seções ou dimensionamento. O adaptador de conectividade acima trata pórticos explicitamente declarados. O modelo misto de treliças e pórticos permanece bloqueado."}</p>
      <ul className="physical-issues">{review.issues.map((i, idx) => <li key={idx}><strong>{i.code}</strong> — {i.message}</li>)}</ul>
      {!review.issues.length && <p className="notice">Todas as declarações deste formulário foram preenchidas. Ainda é necessária validação física e normativa independente.</p>}
      <p>Esta preparação permanece vinculada às medidas pela revisão geométrica registrada. Exporte os dados para revisão externa.</p>
      <button type="button" className="button secondary" onClick={() => downloadText(JSON.stringify({
        format: "jpn.spatial-preparation/1", projectId: project.id, geometrySignature: structureSignature(project),
        geometryStale: review.stale, preparation: draft, issues: review.issues,
        technicalStatus: "preliminary", analysisReady: false,
      }, null, 2), "jpn-preparacao-estrutural.json")}>Exportar declarações e pendências em JSON</button>
      <p className="field-hint">O arquivo é um cadastro de preparação, não uma solicitação jpn.frame3d/1 e não deve ser enviado diretamente ao solver.</p>
      {onOpenSpatial && <div className="actions"><button type="button" className="button secondary" onClick={onOpenSpatial}>Consultar análise 3D experimental</button></div>}
    </>}
    {notice && <p role="status" className="notice">{notice}</p>}
  </section>;
}
