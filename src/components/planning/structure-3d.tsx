"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ViewHelper } from "three/addons/helpers/ViewHelper.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/** Rótulo HTML preso a um nó ou ao meio de uma peça (F3). Só visual; a informação também existe em texto no estúdio. */
/** Camadas de contexto arquitetônico do editor de tesoura (só visuais). */
export type SiteVisibility = { walls: boolean; gutter: boolean; sheet: boolean; plates: boolean };
/** Ações visuais expostas ao estúdio (menu de contexto e Ctrl+K). Nada é persistido. */
export type Viewer3DApi = { view?: (view: StudioView, orthographic: boolean) => void; setRoles?: (visible: PieceRole[]) => void; isolate: (pieceId: string) => void; hideRole: (role: PieceRole) => void; showAll: () => void; measureFrom: (nodeId: string) => void; focus: (pieceId: string) => void; reset: () => void; pickAt: (clientX: number, clientY: number) => string | null };
export type Viewer3DLabel ={ key: string; nodeId?: string; pieceId?: string; text: string; tone?: "neutral" | "ok" | "warn" | "danger" };
import { roles, roleLabels, type PieceRole, type StructureModel, type Planning } from "@/domain/structure";
import type { RoofParameters } from "@/domain/project-details";
import { initialPresentationOptions, presentationEnvelope, type PresentationOptions, type WallLayout, type RoofColor, type RoofFinish } from "./presentation-scene";
import { drawPresentationAnnotations, presentationDimensions, dimensionLabels } from "./presentation-capture";
import { resolveSection } from "@/domain/profile-section";
import { scenePoint } from "./profile-geometry";
import { calculateNodeMeasurement, nextMeasurementNode } from "./node-measurement";
import { buildProfileScene, pieceIdFromHit, viewerQuality, type ViewerMode } from "./profile-scene";
import { createCameraRig, createStudioStage } from "./studio-stage";
import { createTrussSiteScene } from "./truss-site-scene";
import type { TrussEditor } from "@/domain/truss-editor";
import { sectionAxes, sectionAxisLabels, sectionPlane, steelFinishes, steelFinishLabels, viewPose, type Projection, type SectionCut, type SteelFinish, type StudioView } from "./studio-view";

const TRANSITION_MS = 420;
const metres = (mm: number, digits = 3) => (mm / 1000).toLocaleString("pt-BR", { maximumFractionDigits: digits });

export function Structure3D({ model, roof, planning, projectName, selected, onSelect, onDemonstrate, onConfigureProfile, analysisColors, deformed, selectedNodeId, onSelectNode, inspectNodes=false, orientationCube=false, labels, onApi, onHover, siteContext, allowPresentation=true, compact=false, siteVisibility }: { compact?: boolean; siteVisibility?: SiteVisibility; orientationCube?: boolean; labels?: Viewer3DLabel[]; onApi?: (api: Viewer3DApi | null) => void; onHover?: (id: string) => void; siteContext?: TrussEditor; allowPresentation?: boolean; model: StructureModel; roof: RoofParameters; planning: Planning | null; projectName: string; selected: string; onSelect: (id: string) => void; onDemonstrate?: () => void; onConfigureProfile?: () => void; analysisColors?: Record<string, number>; deformed?: { a: [number, number, number]; b: [number, number, number] }[] | null; selectedNodeId?:string; onSelectNode?:(id:string)=>void; inspectNodes?:boolean }) {
  const extents = ["x", "y", "z"].map(k => Math.max(...model.nodes.map(n => n[k as "x" | "y" | "z"])) - Math.min(...model.nodes.map(n => n[k as "x" | "y" | "z"])));
  const gridSpacingM = Math.pow(10, Math.floor(Math.log10(Math.max(...extents.map(v => v / 1000), 1) / 8)));
  const host = useRef<HTMLDivElement>(null), select = useRef(onSelect), highlight = useRef<(id: string) => void>(() => {}), reset = useRef<() => void>(() => {});
  const selectNode=useRef(onSelectNode),nodePicking=useRef(inspectNodes),nodeTools=useRef<(enabled:boolean,id:string,measurementActive?:boolean,ids?:readonly string[])=>void>(()=>{});
  useEffect(()=>{selectNode.current=onSelectNode;},[onSelectNode]);
  const hover=useRef(onHover), pickAt=useRef<(x: number, y: number) => string | null>(() => null);
  useEffect(() => { hover.current = onHover; }, [onHover]);
  // F3: cubo de orientação e rótulos 2D sobre o modelo (opcionais; só o estúdio liga).
  const orientationRef = useRef(orientationCube), applyLabels = useRef<(labels: Viewer3DLabel[]) => void>(() => {});
  useEffect(() => { orientationRef.current = orientationCube; }, [orientationCube]);
  const [measuring, setMeasuring] = useState(false);
  const [measurementSelection, setMeasurementSelection] = useState<{model:StructureModel;ids:string[]}>({model,ids:[]});
  const measuredNodes = useMemo(() => measurementSelection.model === model ? measurementSelection.ids : [], [measurementSelection, model]);
  const measurement = useMemo(() => calculateNodeMeasurement(model.nodes, measuredNodes), [model, measuredNodes]);
  const measurePicking = useRef(false);
  const measurePick = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    measurePick.current = id => setMeasurementSelection(current => ({model,ids:nextMeasurementNode(current.model===model?current.ids:[],id)}));
  }, [model]);
  const [failure, setFailure] = useState("");
  const [pictureError, setPictureError] = useState("");
  const [presentationOptions, setPresentationOptions] = useState<PresentationOptions>(initialPresentationOptions);
  const optionsRef = useRef(presentationOptions);
  const applyOptions = useRef<(options:PresentationOptions)=>void>(()=>{});
  const capture = useRef<()=>void>(()=>{});
  const envelope = useMemo(() => allowPresentation ? presentationEnvelope(roof, planning) : null, [roof, planning, allowPresentation]);
  const dimensions = envelope ? dimensionLabels(presentationDimensions(envelope)) : [];
  const [expanded, setExpanded] = useState(false);
  const [visibleRoles, setVisibleRoles] = useState<PieceRole[]>([...roles]);
  // Modo compacto (passo Tesoura): o canvas ocupa a área; as ferramentas avançadas começam fechadas.
  const [toolsCollapsed, setToolsCollapsed] = useState(compact);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const activeIsolation = isolatedId === selected ? isolatedId : null;
  const selectedPiece = model.pieces.find(piece => piece.id === selected);
  const selectedPieceHidden = !!selectedPiece && !visibleRoles.includes(selectedPiece.role);
  const applyVisibility = useRef<(visible: readonly PieceRole[], isolated: string | null) => void>(() => {});
  const cameraView = useRef<(view: StudioView) => void>(() => {});
  // Opening the viewer always starts with solid profiles, regardless of the mode last used.
  const [mode, setMode] = useState<ViewerMode | "finished">("profiles");
  const changeMode = useRef<(mode: ViewerMode | "finished") => void>(() => {});
  const focus = useRef<(id: string) => void>(() => {});
  const colorize = useRef<(colors?: Record<string, number>) => void>(() => {});
  const showDeformed = useRef<(segments: { a: [number, number, number]; b: [number, number, number] }[] | null) => void>(() => {});
  // F5: ações do menu de contexto do estúdio. Usam os mesmos estados dos botões de ferramentas (só visuais).
  useEffect(() => {
    if (!onApi) return;
    onApi({
      isolate: id => { onSelect(id); setVisibleRoles([...roles]); setIsolatedId(id); },
      hideRole: role => { setVisibleRoles(current => current.filter(r => r !== role)); setIsolatedId(null); },
      showAll: () => { setVisibleRoles([...roles]); setIsolatedId(null); },
      measureFrom: nodeId => { setMeasuring(true); setMeasurementSelection({ model, ids: [nodeId] }); },
      focus: id => focus.current(id),
      reset: () => reset.current(),
      pickAt: (x,y) => pickAt.current(x,y),
      view: (view, orthographic) => { setProjection(orthographic ? "orthographic" : "perspective"); window.requestAnimationFrame(() => cameraView.current(view)); },
      setRoles: visible => { setVisibleRoles(roles.filter(r => visible.includes(r))); setIsolatedId(null); },
    });
    return () => onApi(null);
  }, [onApi, onSelect, model]);
  const applySite = useRef<(v?: SiteVisibility) => void>(() => {});
  useEffect(() => { applySite.current(siteVisibility); }, [siteVisibility, model, siteContext]);
  // Studio tools. All of them are view state: nothing is persisted or sent to the engine.
  const [projection, setProjection] = useState<Projection>("perspective");
  const [finish, setFinish] = useState<SteelFinish>("painted");
  const [ghost, setGhost] = useState(false);
  const [cut, setCut] = useState<SectionCut | null>(null);
  const cutPosition = useRef<HTMLElement>(null), cutRange = useRef<HTMLSpanElement>(null);
  const applyProjection = useRef<(value: Projection) => void>(() => {});
  const applyFinish = useRef<(value: SteelFinish) => void>(() => {});
  const applyGhost = useRef<(value: boolean) => void>(() => {});
  const applySection = useRef<(value: SectionCut | null) => void>(() => {});
  const stats = useRef<HTMLSpanElement>(null);
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  // Um único renderer WebGL por visualizador: trocar o modelo (ex.: rascunho da tesoura a cada edição)
  // troca só a cena e dá dispose na anterior; o canvas e o contexto só são liberados ao desmontar.
  // Este efeito vem ANTES do principal: na desmontagem a limpeza dele roda primeiro e marca o descarte total.
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null), unmounting = useRef(false);
  const cameraMemory = useRef<{ position: THREE.Vector3; target: THREE.Vector3; zoom: number } | null>(null);
  useEffect(() => { unmounting.current = false; return () => { unmounting.current = true; }; }, []);
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer, canvas: HTMLCanvasElement;
    const quality = viewerQuality(model.pieces.length, navigator.hardwareConcurrency, (navigator as Navigator & { deviceMemory?: number }).deviceMemory);
    const kept = rendererRef.current && !rendererRef.current.getContext().isContextLost() ? rendererRef.current : null;
    if (kept) { renderer = kept; canvas = kept.domElement; canvas.dataset.rebuilds = String(Number(canvas.dataset.rebuilds ?? "0") + 1); }
    else {
      canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "default" });
      if (!context) { const timer = setTimeout(() => setFailure("3D indisponível neste dispositivo. Use as vistas 2D acima."), 0); return () => clearTimeout(timer); }
      try { renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false, powerPreference: "default" }); }
      catch { const timer = setTimeout(() => setFailure("3D indisponível neste dispositivo. Use as vistas 2D acima."), 0); return () => clearTimeout(timer); }
      renderer.setClearColor(0xeef1ee); container.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("aria-label", "Modelo 3D da estrutura"); renderer.domElement.setAttribute("role", "img");
      rendererRef.current = renderer; canvas.dataset.rebuilds = "0";
    }
    const buildStart = performance.now();
    const scene = new THREE.Scene();
    // Shadows cost one extra on-demand pass. Keep them unless the device is
    // limited AND the model is large.
    const shadows = !(quality.low && model.pieces.length > 600);
    const stage = createStudioStage(renderer, scene, { shadows, shadowMapSize: quality.low ? 1024 : 2048, environmentSize: quality.low ? 64 : 128 });
    const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 0 : TRANSITION_MS;
    const profiles = buildProfileScene(model, quality.segments); scene.add(profiles.root);
    const site = siteContext ? createTrussSiteScene(siteContext) : null;
    if (site) scene.add(site.root);
    // Camadas de contexto (só visuais) pelo nome dos objetos da cena arquitetônica.
    applySite.current = v => {
      if (!site) return;
      for (const child of site.root.children) {
        const name = child.name;
        child.visible = !v ? true : name.startsWith("Muro") ? v.walls : name.startsWith("Calha") ? v.gutter : name.startsWith("Cobertura") ? v.sheet : v.plates;
      }
      canvas.dataset.siteVisible = String(site.root.children.filter(c => c.visible).length); render();
    };
    canvas.dataset.quality = quality.low ? "reduced" : "standard";
    canvas.dataset.shadows = shadows ? "on" : "off"; canvas.dataset.environment = "pending";
    canvas.dataset.solidCount = String(profiles.solidCount); canvas.dataset.fallbackCount = String(profiles.fallbackCount);
    canvas.dataset.framing = "whole-structure"; canvas.dataset.projection = "perspective";
    canvas.dataset.finish = "painted"; canvas.dataset.ghost = "false"; canvas.dataset.sectionAxis = "";
    const resources: (THREE.BufferGeometry | THREE.Material)[] = [];
    const bounds = site ? profiles.bounds.clone().union(new THREE.Box3().setFromObject(site.root)) : profiles.bounds;
    canvas.dataset.contextType = site ? "truss-architectural-preliminary" : "none";
    // Metadados de teste da representação visual; não descrevem cálculos nem vínculos.
    canvas.dataset.siteSlopes = String(site?.root.userData.slopeCount ?? 0);
    canvas.dataset.siteWalls = String(site?.root.userData.wallCount ?? 0);
    canvas.dataset.siteGutters = String(site?.root.userData.gutterCount ?? 0);
    canvas.dataset.siteAnchors = String(site?.root.userData.anchorCount ?? 0);
    canvas.dataset.siteRoofPanels = String(site?.root.userData.roofPanelCount ?? 0);
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1), gridStep = gridSpacingM;
    const grid = new THREE.GridHelper(gridStep * 20, 20, 0x9aa79c, 0xd3dad2); grid.position.set(center.x, 0, center.z); scene.add(grid);
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const m of gridMaterials) { m.transparent = true; m.opacity = .7; m.depthWrite = false; }
    resources.push(grid.geometry, ...gridMaterials);
    let disposed = false, environment: PresentationHandle | null = null;
    const rig = createCameraRig(1, () => { controls.target.copy(rig.target); controls.update(); render(); });
    const controls = new OrbitControls(rig.active(), renderer.domElement); controls.enableDamping = false;
    // O cubo usa a câmera real para permitir girar por clique, sem um loop permanente.
    const viewHelper = new ViewHelper(rig.active(), renderer.domElement);
    // @types/three ainda não declara a propriedade pública camera do ViewHelper r187.
    const setHelperCamera = (camera: THREE.Camera) => { Object.assign(viewHelper, { camera }); };
    const labelRenderer = new CSS2DRenderer(), labelLayer = labelRenderer.domElement, labelGroup = new THREE.Group();
    labelLayer.className = "viewer-labels"; labelLayer.setAttribute("aria-hidden", "true"); container.appendChild(labelLayer); scene.add(labelGroup);
    // F5: oclusão ambiente (GTAO) e contorno de arestas só no modo Acabado e fora de aparelho fraco.
    // Criados na primeira vez que o modo é usado; as métricas continuam medidas só no passe da cena.
    let post: { composer: EffectComposer; scenePass: RenderPass; gtao: GTAOPass; outline: OutlinePass } | null = null;
    let sceneCalls = 0, sceneTriangles = 0;
    const postprocessing = () => {
      if (post || quality.low) return post;
      const size = renderer.getSize(new THREE.Vector2()), composer = new EffectComposer(renderer);
      const scenePass = new RenderPass(scene, rig.active());
      const sceneRender = scenePass.render.bind(scenePass);
      scenePass.render = (...args: Parameters<RenderPass["render"]>) => { sceneRender(...args); sceneCalls = renderer.info.render.calls; sceneTriangles = renderer.info.render.triangles; };
      const gtao = new GTAOPass(scene, rig.active(), size.x, size.y); gtao.output = GTAOPass.OUTPUT.Default;
      const outline = new OutlinePass(new THREE.Vector2(size.x, size.y), scene, rig.active(), [profiles.root]);
      outline.edgeStrength = 2.2; outline.edgeThickness = 1; outline.visibleEdgeColor.set(0x2b302a); outline.hiddenEdgeColor.set(0x2b302a);
      composer.addPass(scenePass); composer.addPass(gtao); composer.addPass(outline); composer.addPass(new OutputPass());
      post = { composer, scenePass, gtao, outline };
      return post;
    };
    function render() {
      if (disposed) return;
      const effects = canvas.dataset.mode === "finished" ? postprocessing() : null;
      if (effects) {
        const camera = rig.active(); effects.scenePass.camera = camera; effects.gtao.camera = camera; effects.outline.renderCamera = camera;
        effects.composer.render();
        canvas.dataset.drawCalls = String(sceneCalls); canvas.dataset.triangles = String(sceneTriangles); canvas.dataset.postprocessing = "gtao+outline";
      } else {
        renderer.render(scene, rig.active());
        canvas.dataset.drawCalls = String(renderer.info.render.calls); canvas.dataset.triangles = String(renderer.info.render.triangles); canvas.dataset.postprocessing = "off";
      }
      if (stats.current) stats.current.textContent = `${canvas.dataset.drawCalls} chamadas · ${Number(canvas.dataset.triangles).toLocaleString("pt-BR")} triângulos`;
      if (environment) { const sources = environment.status(); canvas.dataset.carSource = sources.carSource; canvas.dataset.personSource = sources.personSource; }
      // Depois das métricas: o cubo não entra nas contagens de chamadas/triângulos usadas pelos testes.
      const presenting = canvas.dataset.mode === "finished";
      canvas.dataset.orientationCube = orientationRef.current && !presenting ? "on" : "off";
      if (orientationRef.current && !presenting) {
        // Sem autoClear: o cubo é desenhado por cima da cena, só no canto.
        const autoClear = renderer.autoClear; renderer.autoClear = false;
        setHelperCamera(rig.active()); viewHelper.render(renderer);
        renderer.autoClear = autoClear;
      }
      labelLayer.style.display = presenting ? "none" : "";
      if (labelGroup.children.length && !presenting) labelRenderer.render(scene, rig.active());
    }
    applyLabels.current = list => {
      for (const child of [...labelGroup.children]) { labelGroup.remove(child); (child as CSS2DObject).element.remove(); }
      const at = new Map(model.nodes.map(n => [n.id, n]));
      for (const label of list) {
        let position: THREE.Vector3 | null = null;
        if (label.nodeId && at.has(label.nodeId)) position = scenePoint(at.get(label.nodeId)!);
        else if (label.pieceId) { const piece = model.pieces.find(p => p.id === label.pieceId); const a = piece && at.get(piece.start), b = piece && at.get(piece.end); if (a && b) position = scenePoint(a).add(scenePoint(b)).multiplyScalar(.5); }
        if (!position) continue;
        const element = document.createElement("span"); element.className = `viewer-label viewer-label--${label.tone ?? "neutral"}`; element.textContent = label.text;
        const object = new CSS2DObject(element); object.position.copy(position); labelGroup.add(object);
      }
      canvas.dataset.labels = String(labelGroup.children.length); render();
    };
    const nodeGeometry=new THREE.SphereGeometry(span/150,8,6),nodeMaterial=new THREE.MeshBasicMaterial({depthTest:false,transparent:true,opacity:.9,toneMapped:false});
    const nodeMarkers=new THREE.InstancedMesh(nodeGeometry,nodeMaterial,model.nodes.length);nodeMarkers.renderOrder=10;nodeMarkers.visible=false;scene.add(nodeMarkers);resources.push(nodeGeometry,nodeMaterial);
    const nodeMatrix=new THREE.Matrix4();model.nodes.forEach((n,i)=>{nodeMatrix.makeTranslation(scenePoint(n).x,scenePoint(n).y,scenePoint(n).z);nodeMarkers.setMatrixAt(i,nodeMatrix);nodeMarkers.setColorAt(i,new THREE.Color(0x8262b5));});
    nodeMarkers.instanceMatrix.needsUpdate=true;
    // Visual-only measuring overlay; points come from real model node IDs, in mm.
    const measureGeometry = new THREE.BufferGeometry();
    measureGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const measureMaterial = new THREE.LineBasicMaterial({ color: 0xd34a32, depthTest: false, depthWrite: false, toneMapped: false });
    const measureLine = new THREE.Line(measureGeometry, measureMaterial);
    measureLine.visible = false; measureLine.renderOrder = 12; scene.add(measureLine);
    resources.push(measureGeometry, measureMaterial);
    nodeTools.current=(enabled,id,measurementActive=false,ids=[])=>{
      nodePicking.current=enabled;measurePicking.current=measurementActive;
      nodeMarkers.visible=enabled||measurementActive;
      model.nodes.forEach((n,i)=>nodeMarkers.setColorAt(i,new THREE.Color(
        measurementActive&&ids.includes(n.id)?0xd34a32:n.id===id?0xe89f27:0x8262b5
      )));
      if(nodeMarkers.instanceColor)nodeMarkers.instanceColor.needsUpdate=true;
      measureLine.visible=false;
      const value=measurementActive?calculateNodeMeasurement(model.nodes,ids):null;
      if(value){
        const a=model.nodes.find(n=>n.id===value.from)!,b=model.nodes.find(n=>n.id===value.to)!;
        const start=scenePoint(a),end=scenePoint(b);
        const positions=measureGeometry.getAttribute("position") as THREE.BufferAttribute;
        positions.setXYZ(0,start.x,start.y,start.z);
        positions.setXYZ(1,end.x,end.y,end.z);
        positions.needsUpdate=true;measureGeometry.computeBoundingSphere();
        measureLine.visible=true;
      }
      canvas.dataset.selectedNode=id;
      canvas.dataset.nodeMarkers=nodeMarkers.visible?String(model.nodes.length):"0";
      canvas.dataset.measuring=measurementActive?"true":"false";
      canvas.dataset.measurementNodes=measurementActive?ids.join(","):"";
      canvas.dataset.measurementLengthMm=value?String(value.lengthMm):"";
      render();
    };
    colorize.current = colors => { profiles.setColors(colors); stage.setNeutral(!!colors); canvas.dataset.analysisMode = colors ? "experimental" : "none"; render(); };
    // INT-1f: deformed axes (scene metres, y-up) as one traced line layer; replaced or removed on every change.
    let deformedLines: THREE.LineSegments | null = null;
    showDeformed.current = segments => {
      if (deformedLines) { scene.remove(deformedLines); deformedLines.geometry.dispose(); (deformedLines.material as THREE.Material).dispose(); deformedLines = null; }
      if (segments?.length) {
        const positions = new Float32Array(segments.length * 6); segments.forEach((s, k) => positions.set([...s.a, ...s.b], k * 6));
        const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        deformedLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xd9661f, depthTest: false })); deformedLines.renderOrder = 13; scene.add(deformedLines);
      }
      canvas.dataset.deformed = segments?.length ? "on" : "off"; render();
    };
    let framingBounds = bounds, activeMode: ViewerMode | "finished" = "profiles";
    let cameraFramed = false;
    type PresentationHandle = ReturnType<typeof import("./presentation-scene")["createPresentationScene"]>;
    const presentationBounds = envelope ? new THREE.Box3().setFromPoints([
      new THREE.Vector3(-3,0,3),new THREE.Vector3(envelope.widthM+3,envelope.highHeightM+1,-envelope.lengthM-3),
    ]) : bounds;
    const wholeBounds = () => activeMode === "finished" ? bounds.clone().union(presentationBounds) : bounds;
    const lightScene = () => stage.frame(wholeBounds(), Math.min(0, bounds.min.y), activeMode !== "finished");
    const goTo = (view: StudioView, target: THREE.Box3, animate: boolean) => {
      const camera = rig.perspective;
      rig.moveTo(viewPose(target, view, camera.aspect, camera.fov), animate && cameraFramed ? duration : 0);
      cameraFramed = true; canvas.dataset.cameraView = view;
    };
    const fitFull = (animate = true) => {
      framingBounds = wholeBounds();
      canvas.dataset.framing = "whole-structure";
      goTo("iso", framingBounds, animate);
    };
    cameraView.current = view => {
      framingBounds = wholeBounds();
      canvas.dataset.framing = "whole-structure";
      goTo(view, framingBounds, true);
    };
    applyProjection.current = value => {
      rig.setProjection(value); controls.object = rig.active(); controls.update();
      canvas.dataset.projection = value; render();
    };
    applyFinish.current = value => { profiles.setFinish(value); canvas.dataset.finish = value; render(); };
    applyGhost.current = value => { profiles.setGhost(value); canvas.dataset.ghost = profiles.ghostActive() ? "true" : "false"; render(); };
    // View-only section cut: a renderer clipping plane plus a thin outline.
    const cutGeometry = new THREE.BufferGeometry(), cutMaterial = new THREE.LineBasicMaterial({ color: 0xd34a32, toneMapped: false });
    const cutOutline = new THREE.LineLoop(cutGeometry, cutMaterial); cutOutline.visible = false; cutOutline.renderOrder = 11; scene.add(cutOutline);
    resources.push(cutGeometry, cutMaterial);
    let activePlane: THREE.Plane | null = null;
    // Shadow maps ignore renderer-level planes; clip the bar materials too so a
    // removed half never leaves a shadow behind.
    renderer.localClippingEnabled = true;
    const clipMaterials = (plane: THREE.Plane | null) => {
      for (const material of [profiles.material, profiles.focusMesh.material as THREE.Material]) {
        const had = !!material.clippingPlanes?.length;
        material.clippingPlanes = plane ? [plane] : null; material.clipShadows = !!plane;
        if (had !== !!plane) material.needsUpdate = true;
      }
    };
    applySection.current = value => {
      if (!value || activeMode === "finished") {
        activePlane = null; renderer.clippingPlanes = []; clipMaterials(null); cutOutline.visible = false;
        canvas.dataset.sectionAxis = ""; canvas.dataset.sectionPositionMm = ""; render(); return;
      }
      const result = sectionPlane(bounds, value), pad = span * .04, p = result.positionMm / 1000;
      activePlane = result.plane; renderer.clippingPlanes = [activePlane]; clipMaterials(activePlane);
      const lo = bounds.min.clone().addScalar(-pad), hi = bounds.max.clone().addScalar(pad);
      // Keep the outline a hair inside the kept side so the plane never clips it.
      const inside = activePlane.normal.clone().multiplyScalar(.002);
      const corners = value.axis === "x" ? [[p, lo.y, lo.z], [p, hi.y, lo.z], [p, hi.y, hi.z], [p, lo.y, hi.z]]
        : value.axis === "y" ? [[lo.x, lo.y, -p], [hi.x, lo.y, -p], [hi.x, hi.y, -p], [lo.x, hi.y, -p]]
        : [[lo.x, p, lo.z], [hi.x, p, lo.z], [hi.x, p, hi.z], [lo.x, p, hi.z]];
      cutGeometry.setFromPoints(corners.map(([x, y, z]) => new THREE.Vector3(x, y, z).add(inside))); cutGeometry.computeBoundingSphere();
      cutOutline.visible = true;
      canvas.dataset.sectionAxis = value.axis; canvas.dataset.sectionPositionMm = String(Math.round(result.positionMm)); canvas.dataset.sectionFlipped = String(value.flipped);
      // The readout shows the exact plane position used by the renderer.
      if (cutPosition.current) cutPosition.current.textContent = `${metres(result.positionMm)} m`;
      if (cutRange.current) cutRange.current.textContent = ` (de ${metres(result.rangeMm[0])} m a ${metres(result.rangeMm[1])} m)`;
      render();
    };
    applyVisibility.current = (visible, isolated) => {
      profiles.setVisibility(new Set(visible), isolated);
      canvas.dataset.visibleRoles = visible.join(",");
      canvas.dataset.isolatedPiece = isolated ?? "";
      canvas.dataset.ghost = profiles.ghostActive() ? "true" : "false";
      render();
    };
    changeMode.current = value => {
      const previousMode = activeMode;
      activeMode = value;
      profiles.setMode(value === "finished" ? "profiles" : value);
      grid.visible = value !== "finished";
      if (value === "finished") { activePlane = null; renderer.clippingPlanes = []; clipMaterials(null); cutOutline.visible = false; canvas.dataset.sectionAxis = ""; }
      canvas.dataset.mode = value; canvas.dataset.ghost = profiles.ghostActive() ? "true" : "false";
      if(environment) environment.root.visible = value === "finished";
      lightScene();
      if(value === "finished" && envelope && !environment) {
        void import("./presentation-scene").then(({createPresentationScene}) => {
          if(disposed || activeMode !== "finished" || environment) return;
          // Rest the visual sheeting above the purlins instead of through them.
          const lift = Math.max(0, profiles.purlinTopOffsetM() - .035 + .006);
          environment = createPresentationScene(envelope,optionsRef.current,render,lift);
          scene.add(environment.root);
          canvas.dataset.contextLoaded = "true"; canvas.dataset.roofRelief = "procedural";
          fitFull(false);
        }).catch(()=>{if(!disposed)setPictureError("O ambiente 3D não pôde ser carregado. Retorne aos Perfis 3D.");});
      }
      if(value === "finished" || previousMode === "finished") { fitFull(false); resize(); } else render();
    };
    applyOptions.current = options => { environment?.update(options);render(); };
    capture.current = () => {
      if(activeMode !== "finished" || !envelope) return;
      try {
        render();
        const frame = document.createElement("canvas");
        frame.width = renderer.domElement.width; frame.height = renderer.domElement.height;
        const ctx = frame.getContext("2d");if(!ctx)throw new Error("Canvas 2D indisponível");
        ctx.drawImage(renderer.domElement,0,0,frame.width,frame.height);
        drawPresentationAnnotations(ctx,frame.width,frame.height,projectName,presentationDimensions(envelope),optionsRef.current.showDimensions);
        frame.toBlob(blob=>{
          if(!blob){setPictureError("Não foi possível gerar o PNG.");return;}
          const url=URL.createObjectURL(blob),anchor=document.createElement("a");
          anchor.href=url;anchor.download="jpn-apresentacao-preliminar.png";anchor.click();
          window.setTimeout(()=>URL.revokeObjectURL(url),1000);
        },"image/png");
        setPictureError("");
      } catch { setPictureError("Falha ao exportar a imagem neste navegador."); }
    };
    reset.current = () => fitFull(true);
    focus.current = id => {
      const item = profiles.instances.get(id), piece = model.pieces.find(p => p.id === id);
      if (!piece) return;
      let pieceBounds: THREE.Box3;
      if (item) { const matrix = new THREE.Matrix4(); item.mesh.getMatrixAt(item.index, matrix); pieceBounds = item.mesh.geometry.boundingBox!.clone().applyMatrix4(matrix); }
      else { const points = model.nodes.filter(n => n.id === piece.start || n.id === piece.end).map(n => new THREE.Vector3(n.x / 1000, n.z / 1000, -n.y / 1000)); pieceBounds = new THREE.Box3().setFromPoints(points); }
      framingBounds = pieceBounds; canvas.dataset.framing = "selected-piece";
      goTo("iso", pieceBounds, true);
    };
    highlight.current = id => { profiles.highlight(id); canvas.dataset.selectedPiece = id; canvas.dataset.ghost = profiles.ghostActive() ? "true" : "false"; render(); };
    const resize = () => {
      const width = Math.max(container.clientWidth, 1), height = Math.max(container.clientHeight, 1);
      // iPhone/WebKit may report only a few CPU cores. Keep fine pixels even when
      // reducing mesh complexity; cap the total GPU framebuffer for stability.
      const pixelBudget = quality.low ? 1_200_000 : 2_400_000;
      const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, activeMode === "finished" ? 2 : quality.pixelRatio, Math.sqrt(pixelBudget / (width * height))));
      renderer.setPixelRatio(ratio); canvas.dataset.pixelRatio = ratio.toFixed(2);
      renderer.setSize(width, height); labelRenderer.setSize(width, height);
      if (post) { post.composer.setPixelRatio(ratio); post.composer.setSize(width, height); }
      rig.setAspect(width / height);
      // Preserve camera pose and zoom after viewport/orientation changes.
      if (!cameraFramed) { lightScene(); goTo("iso", framingBounds, false); }
      controls.update(); render();
    };
    const follow = () => { rig.target.copy(controls.target); render(); };
    const observer = new ResizeObserver(resize); observer.observe(container); controls.addEventListener("change", follow);
    const raycaster = new THREE.Raycaster(); raycaster.params.Line = { threshold: span / 180 };
    let startX = 0, startY = 0, hoverFrame = 0, orientationFrame = 0, lastHover = "";
    const pickPiece = (x: number, y: number, commit: boolean): string | null => {
      if (activeMode === "finished") return null;
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height || x < rect.left || y < rect.top || x > rect.right || y > rect.bottom) return null;
      raycaster.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), rig.active());
      const hit = raycaster.intersectObjects(profiles.targets(), false).find(h => !activePlane || activePlane.distanceToPoint(h.point) >= 0);
      const id = hit ? pieceIdFromHit(hit) : null;
      if (id && commit) { canvas.dataset.pickedPiece = id; select.current(id); }
      return id;
    };
    pickAt.current = (x, y) => pickPiece(x, y, true);
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || hoverFrame) return;
      const x = e.clientX, y = e.clientY;
      hoverFrame = window.requestAnimationFrame(() => {
        hoverFrame = 0;
        const id = pickPiece(x, y, false) ?? "";
        if (id === lastHover) return;
        lastHover = id; canvas.style.cursor = id ? "pointer" : ""; hover.current?.(id);
      });
    };
    const leave = () => {
      window.cancelAnimationFrame(hoverFrame); hoverFrame = 0;
      if (lastHover) { lastHover = ""; hover.current?.(""); }
      canvas.style.cursor = "";
    };
    const stopOrientation = () => {
      if (orientationFrame) window.cancelAnimationFrame(orientationFrame);
      orientationFrame = 0;
      if (viewHelper.animating) { viewHelper.update(1); controls.update(); }
    };
    const down = (e: PointerEvent) => { startX = e.clientX; startY = e.clientY; rig.cancel(); stopOrientation(); };
    const wheel = () => { rig.cancel(); stopOrientation(); };
    const up = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), rig.active());
      if (activeMode === "finished") return;
      if (orientationRef.current && e.button === 0) {
        setHelperCamera(rig.active());
        viewHelper.center.copy(controls.target);
        if (viewHelper.handleClick(e)) {
          rig.cancel();
          canvas.dataset.cameraView = "orientation-cube";
          let previous = performance.now();
          const tick = (now: number) => {
            if (disposed) return;
            viewHelper.update(reducedMotion ? 1 : Math.max(1 / 120, Math.min(.1, (now - previous) / 1000)));
            previous = now;
            render();
            if (viewHelper.animating) orientationFrame = window.requestAnimationFrame(tick);
            else { orientationFrame = 0; controls.update(); }
          };
          tick(performance.now() + 16);
          return;
        }
      }
      if((nodePicking.current||measurePicking.current)&&nodeMarkers.visible){
        const nodeHit=raycaster.intersectObject(nodeMarkers,false)[0];
        if(nodeHit?.instanceId!==undefined){const id=model.nodes[nodeHit.instanceId]?.id;if(id){
          canvas.dataset.pickedNode=id;
          if(measurePicking.current)measurePick.current(id);
          else selectNode.current?.(id);
          return;
        }}
      }
      // Never pick what the section cut has removed from view.
      pickPiece(e.clientX, e.clientY, true);
    };
    const lost = (e: Event) => { e.preventDefault(); rig.cancel(); setFailure("O dispositivo perdeu o contexto gráfico. As vistas 2D continuam disponíveis."); };
    renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointerup", up); renderer.domElement.addEventListener("pointermove", move); renderer.domElement.addEventListener("pointerleave", leave); renderer.domElement.addEventListener("webglcontextlost", lost);
    renderer.domElement.addEventListener("wheel", wheel, { passive: true });
    resize();
    // Modelo trocado no mesmo canvas (rascunho ao vivo): a câmera continua onde o usuário deixou.
    const memory = kept ? cameraMemory.current : null;
    if (memory) {
      const camera = rig.active() as THREE.PerspectiveCamera | THREE.OrthographicCamera;
      camera.position.copy(memory.position); camera.zoom = memory.zoom; camera.updateProjectionMatrix();
      controls.target.copy(memory.target); rig.target.copy(memory.target); controls.update(); cameraMemory.current = null; render();
    }
    canvas.dataset.buildMs = (performance.now() - buildStart).toFixed(1);
    canvas.dataset.geometries = String(renderer.info.memory.geometries);
    // Reflections arrive after the first frame so opening never waits for them.
    const environmentTimer = window.setTimeout(() => {
      if (disposed) return;
      canvas.dataset.environment = stage.loadEnvironment() ? "procedural" : "none";
      canvas.dataset.environmentMs = stage.environmentMs().toFixed(0); render();
    }, 60);
    return () => { disposed = true; window.cancelAnimationFrame(hoverFrame); window.cancelAnimationFrame(orientationFrame); pickAt.current=()=>null; applyLabels.current = () => {}; viewHelper.dispose(); labelLayer.remove(); if (post) { post.gtao.dispose(); post.outline.dispose(); post.composer.dispose(); post = null; } showDeformed.current(null); window.clearTimeout(environmentTimer); rig.cancel(); environment?.dispose(); observer.disconnect(); controls.removeEventListener("change", follow); controls.dispose(); profiles.dispose(); site?.dispose(); nodeMarkers.dispose(); nodeTools.current=()=>{}; resources.forEach(r => r.dispose()); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointerup", up); renderer.domElement.removeEventListener("pointermove", move); renderer.domElement.removeEventListener("pointerleave", leave); renderer.domElement.removeEventListener("webglcontextlost", lost); renderer.domElement.removeEventListener("wheel", wheel); renderer.clippingPlanes = []; stage.dispose();
      if (unmounting.current) { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); rendererRef.current = null; cameraMemory.current = null; }
      else {
        // Troca de modelo: mantém canvas/contexto e guarda a câmera para a próxima cena.
        const camera = rig.active() as THREE.PerspectiveCamera | THREE.OrthographicCamera;
        cameraMemory.current = { position: camera.position.clone(), target: controls.target.clone(), zoom: camera.zoom };
        renderer.renderLists.dispose();
      }
      highlight.current = () => {}; changeMode.current = () => {}; applyOptions.current = () => {}; capture.current = () => {}; reset.current = () => {}; focus.current = () => {}; applyVisibility.current = () => {}; cameraView.current = () => {}; applyProjection.current = () => {}; applyFinish.current = () => {}; applyGhost.current = () => {}; applySection.current = () => {}; };
  }, [model, gridSpacingM, envelope, projectName, siteContext]);
  useEffect(() => { changeMode.current(mode); }, [mode, model]);
  useEffect(() => { optionsRef.current = presentationOptions; applyOptions.current(presentationOptions); }, [presentationOptions]);
  useEffect(() => { highlight.current(selected); }, [selected, model]);
  useEffect(() => { colorize.current(analysisColors); }, [analysisColors, model]);
  useEffect(() => { showDeformed.current(deformed ?? null); }, [deformed, model]);
  useEffect(() => { applyLabels.current(labels ?? []); }, [labels, model]);
  useEffect(() => { applyProjection.current(projection); }, [projection, model]);
  useEffect(() => { applyFinish.current(finish); }, [finish, model]);
  useEffect(() => { applyGhost.current(ghost && mode !== "finished"); }, [ghost, mode, model, selected]);
  useEffect(() => { applySection.current(mode === "finished" ? null : cut); }, [cut, mode, model]);
  useEffect(()=>{nodeTools.current(inspectNodes&&mode!=="finished",selectedNodeId??"",measuring&&mode!=="finished",measuredNodes);},[inspectNodes,selectedNodeId,mode,model,measuring,measuredNodes]);
  useEffect(() => {
    applyVisibility.current(mode === "finished" ? roles : visibleRoles, mode === "finished" ? null : activeIsolation);
  }, [visibleRoles, activeIsolation, mode, model]);
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [expanded]);
  const fallbackCount = model.pieces.filter(p => !resolveSection(p.profile).section).length;
  const technical = !failure && mode !== "finished";
  return <div className={expanded ? "structure-viewer structure-viewer--expanded studio" : "structure-viewer studio"}>
    {expanded && <div className="structure-viewer-heading"><strong>Apresentação da estrutura · 3D</strong><button type="button" className="button secondary" onClick={() => setExpanded(false)}>Fechar tela cheia</button></div>}
    {!failure && !compact && <div className="view-switch" role="group" aria-label="Modo de visualização 3D">{([["structural", "Estrutural"], ["profiles", "Perfis 3D"], ["mixed", "Misto"], ["finished", "Acabado"]] as const).filter(([value]) => (allowPresentation && !analysisColors) || value !== "finished").map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} className={mode === value ? "selected" : ""} onClick={() => setMode(value)}>{label}</button>)}</div>}
    {technical && <div className={toolsCollapsed ? "inspection-tools inspection-tools--collapsed" : "inspection-tools"} aria-label="Ferramentas de inspeção 3D">
      <button type="button" className="inspection-collapse" aria-expanded={!toolsCollapsed} onClick={() => setToolsCollapsed(value => !value)}>{toolsCollapsed ? "Mostrar ferramentas" : "Recolher ferramentas"}</button>
      {!toolsCollapsed && <>
      <details className="inspection-layers">
        <summary>Camadas · {visibleRoles.length} de {roles.length}</summary>
        <div className="inspection-layer-options">
          {roles.map(role => <label key={role}><input type="checkbox" checked={visibleRoles.includes(role)} onChange={e => {
            setVisibleRoles(current => e.target.checked ? roles.filter(r => r === role || current.includes(r)) : current.filter(r => r !== role));
            setIsolatedId(null);
          }} />{roleLabels[role]}</label>)}
        </div>
      </details>
      <button type="button" className="button secondary" disabled={!selected} aria-pressed={!!activeIsolation} onClick={() => {
        if (!selected || !model.pieces.some(p => p.id === selected)) return;
        setVisibleRoles([...roles]);
        setIsolatedId(current => current === selected ? null : selected);
      }}>{activeIsolation ? "Sair do isolamento" : "Isolar peça"}</button>
      <button type="button" className="button secondary" disabled={!activeIsolation && visibleRoles.length === roles.length} onClick={() => {
        setVisibleRoles([...roles]); setIsolatedId(null);
      }}>Mostrar tudo</button>
      <button type="button" className="button secondary" aria-pressed={measuring} onClick={() => {
        setMeasuring(value => !value); setMeasurementSelection({model,ids:[]});
      }}>{measuring ? "Encerrar medição" : "Medir entre nós"}</button>
      <button type="button" className="button secondary" aria-pressed={!!cut} onClick={() => setCut(value => value ? null : { axis: "y", fraction: .5, flipped: false })}>{cut ? "Encerrar corte" : "Corte 3D"}</button>
      <button type="button" className="button secondary" aria-pressed={ghost} disabled={mode === "structural"} title="Deixa as outras peças translúcidas quando há uma peça selecionada" onClick={() => setGhost(value => !value)}>{ghost ? "Raio-X ligado" : "Raio-X da seleção"}</button>
      <label className="studio-field">Acabamento do aço (visual)
        <select className="input" value={finish} disabled={!!analysisColors} onChange={e => setFinish(e.target.value as SteelFinish)}>{steelFinishes.map(value => <option key={value} value={value}>{steelFinishLabels[value]}</option>)}</select>
      </label>
      </>}
      {cut && <div className="inspection-measurement studio-section" role="group" aria-label="Plano de corte 3D" data-testid="3d-section">
        <label>Eixo do corte
          <select className="input" aria-label="Eixo do corte" value={cut.axis} onChange={e => setCut({ ...cut, axis: e.target.value as SectionCut["axis"] })}>{sectionAxes.map(axis => <option key={axis} value={axis}>{sectionAxisLabels[axis]}</option>)}</select>
        </label>
        <label>Posição do corte <strong ref={cutPosition} data-testid="3d-section-position" />
          <input type="range" aria-label="Posição do corte" min="0" max="1" step="0.01" value={cut.fraction} onChange={e => setCut({ ...cut, fraction: Number(e.target.value) })}/>
        </label>
        <label className="studio-check"><input type="checkbox" checked={cut.flipped} onChange={e => setCut({ ...cut, flipped: e.target.checked })}/>Inverter lado visível</label>
        <small>Corte apenas visual, em coordenadas do projeto<span ref={cutRange} />. A geometria e os dados da estrutura não são alterados.</small>
      </div>}
      {measuring && <div className="inspection-measurement" role="status" aria-live="polite" data-testid="3d-measurement">
        <label>Nó inicial
          <select className="input" aria-label="Nó inicial da medição" value={measuredNodes[0]??""} onChange={event =>
            setMeasurementSelection({model,ids:event.target.value?[event.target.value]:[]})}>
            <option value="">Selecionar nó</option>
            {model.nodes.map(n=><option key={n.id} value={n.id}>{n.id}</option>)}
          </select>
        </label>
        <label>Nó final
          <select className="input" aria-label="Nó final da medição" disabled={!measuredNodes[0]} value={measuredNodes[1]??""} onChange={event =>
            setMeasurementSelection({model,ids:event.target.value?[measuredNodes[0],event.target.value]:[measuredNodes[0]]})}>
            <option value="">Selecionar nó</option>
            {model.nodes.filter(n=>n.id!==measuredNodes[0]).map(n=><option key={n.id} value={n.id}>{n.id}</option>)}
          </select>
        </label>
        {measurement ? <>
          <strong>{measurement.from} → {measurement.to}: {(measurement.lengthMm/1000).toLocaleString("pt-BR",{maximumFractionDigits:3})} m</strong>
          <span>ΔX {(measurement.dxMm/1000).toLocaleString("pt-BR",{maximumFractionDigits:3})} m · ΔY {(measurement.dyMm/1000).toLocaleString("pt-BR",{maximumFractionDigits:3})} m · ΔZ {(measurement.dzMm/1000).toLocaleString("pt-BR",{maximumFractionDigits:3})} m</span>
          <button type="button" className="button secondary" onClick={() => setMeasurementSelection({model,ids:[]})}>Nova medida</button>
        </> : <span>{measuredNodes.length===1 ? `Primeiro nó: ${measuredNodes[0]}. Selecione outro nó no desenho.` : "Selecione dois nós destacados no modelo para medir a distância direta."}</span>}
        <small>Medida geométrica visual, sem tolerâncias de montagem ou aprovação estrutural.</small>
      </div>}
    </div>}
    {!failure && !compact && mode !== "structural" && <div className="notice structure-profile-notice" data-testid="profile-coverage">
      <strong>{model.pieces.length - fallbackCount} peças com seção 3D · {fallbackCount} em linha.</strong>
      {fallbackCount > 0 && <><p>Para visualizar perfis reais, informe família, dimensões e espessura de cada categoria. O sistema não inventa medidas para projetos antigos.</p><div className="actions">{onConfigureProfile && <button type="button" className="button" onClick={onConfigureProfile}>Cadastrar dimensões</button>}{onDemonstrate && <button type="button" className="button secondary" onClick={onDemonstrate}>Ver demonstração com perfis</button>}</div></>}
    </div>}
    <div className="presentation-viewport">
      <div ref={host} className="structure-3d" hidden={!!failure} />
      {!failure && <div className="studio-camera" aria-label="Câmera do Studio 3D">
        <div className="inspection-view-buttons" role="group" aria-label="Orientação da câmera 3D">
          <button type="button" aria-label="Vista isométrica" title="Vista isométrica" onClick={() => cameraView.current("iso")}>Iso</button>
          <button type="button" onClick={() => cameraView.current("top")}>Superior</button>
          <button type="button" onClick={() => cameraView.current("front")}>Frontal</button>
          <button type="button" onClick={() => cameraView.current("side")}>Lateral</button>
        </div>
        <button type="button" className="studio-projection" aria-pressed={projection === "orthographic"} title="Alterna entre perspectiva e projeção ortográfica real" onClick={() => setProjection(value => value === "perspective" ? "orthographic" : "perspective")}>{projection === "orthographic" ? "Ortográfica" : "Perspectiva"}</button>
      </div>}
      {!failure && <span ref={stats} className="studio-stats" aria-hidden="true" />}
      {!failure && mode === "finished" && envelope && <div className="presentation-hud" aria-label="Cotas do pré-projeto">
        <span className="presentation-label">JPN · PRÉ-PROJETO VISUAL · NÃO DIMENSIONADO</span>
        {presentationOptions.showDimensions && <div className="presentation-dimensions">{dimensions.map(label=><span key={label}>{label}</span>)}</div>}
      </div>}
      {technical && selectedPiece && <aside className="inspection-selected-piece" data-testid="inspection-selected-piece" aria-label="Detalhes da peça selecionada">
        <div className="inspection-selected-description">
          <span className="inspection-selected-kicker">INSPEÇÃO VISUAL · NÃO DIMENSIONADO</span>
          <strong>{selectedPiece.id} · {roleLabels[selectedPiece.role]}</strong>
          <span>{(selectedPiece.lengthMm / 1000).toLocaleString("pt-BR", {maximumFractionDigits: 3})} m · {selectedPiece.profile.section || selectedPiece.profile.name || "Seção não informada"}</span>
          <span className="studio-piece-meta">Nós {selectedPiece.start} → {selectedPiece.end}{selectedPiece.massKg !== null ? ` · ${selectedPiece.massKg.toLocaleString("pt-BR", {maximumFractionDigits: 1})} kg (massa cadastrada)` : ""}</span>
          {selectedPieceHidden && <span className="inspection-selected-hidden">Esta categoria está oculta nas camadas.</span>}
        </div>
        <div className="inspection-selected-actions">
          {selectedPieceHidden ? <button type="button" onClick={() => {setVisibleRoles(current => roles.filter(role => role === selectedPiece.role || current.includes(role)));setIsolatedId(null);}}>Mostrar categoria</button> : <button type="button" onClick={() => focus.current(selectedPiece.id)}>Aproximar</button>}
          <button type="button" onClick={() => {setIsolatedId(null);onSelect("");}}>Limpar seleção</button>
        </div>
      </aside>}
    </div>
    {!failure && mode === "finished" && <section className="presentation-controls" aria-label="Personalizar apresentação da obra">
      <div className="presentation-controls-head"><strong>Personalizar visualização</strong><span>Elementos cenográficos, sem alteração do orçamento ou da estrutura</span></div>
      <div className="presentation-settings">
        <label>Tipo de telha<select className="input" value={presentationOptions.roofFinish} onChange={e=>setPresentationOptions(o=>({...o,roofFinish:e.target.value as RoofFinish}))}><option value="trapezoidal">Trapezoidal (visual)</option><option value="sandwich">Termoacústica (visual)</option><option value="standing">Junta agrafada (visual)</option><option value="corrugated">Ondulada (visual)</option></select></label>
        <label>Cor do telhado<select className="input" value={presentationOptions.roofColor} onChange={e=>setPresentationOptions(o=>({...o,roofColor:e.target.value as RoofColor}))}>{Object.entries({graphite:"Grafite",silver:"Prata",white:"Branco",terracotta:"Terracota"}).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Paredes<select className="input" value={presentationOptions.walls} onChange={e=>setPresentationOptions(o=>({...o,walls:e.target.value as WallLayout}))}><option value="none">Sem paredes</option><option value="rear">Parede do fundo</option><option value="sides">Duas laterais</option><option value="three">Fundo + laterais</option><option value="closed">Quatro paredes</option></select></label>
        <label>Opacidade do telhado <strong>{Math.round(presentationOptions.roofOpacity*100)}%</strong><input type="range" min="0.15" max="1" step="0.05" value={presentationOptions.roofOpacity} onChange={e=>setPresentationOptions(o=>({...o,roofOpacity:Number(e.target.value)}))}/></label>
      </div>
      <div className="presentation-toggles">
        {([["showPerson","Pessoa (1,70 m)"],["showCar","Carro (4,50 m)"],["showDimensions","Exibir cotas"]] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={presentationOptions[key]} onChange={e=>setPresentationOptions(o=>({...o,[key]:e.target.checked}))}/>{label}</label>)}
        <button type="button" className="button secondary studio-xray" aria-pressed={presentationOptions.roofOpacity <= .35} onClick={() => setPresentationOptions(o => ({ ...o, roofOpacity: o.roofOpacity <= .35 ? 1 : .3 }))}>{presentationOptions.roofOpacity <= .35 ? "Telhado opaco" : "Ver estrutura sob o telhado"}</button>
      </div>
      <p className="field-hint">Telha, relevo das nervuras, beiral, cumeeira, paredes, veículo e pessoa são ilustrativos e não compõem a lista de materiais. Mude para Perfis 3D para selecionar ou editar peças.</p>
    </section>}
    {failure ? <p role="status" className="notice">{failure}</p> : <>
      <div className="actions structure-viewer-tools"><button type="button" className="button" onClick={() => setExpanded(v => !v)}>{expanded ? "Sair da tela cheia" : "Tela cheia"}</button><button className="button secondary" type="button" onClick={() => reset.current()}>Isométrica · ajustar 3D</button><button className="button secondary" type="button" disabled={!selected || mode === "finished"} onClick={() => focus.current(selected)}>Focar peça selecionada</button>{mode === "finished" && <button type="button" className="button" onClick={() => capture.current()}>Salvar imagem PNG</button>}</div>
      {pictureError && <p role="alert" className="field-error">{pictureError}</p>}
      {!compact && <p className="drawing-help">Arraste para girar; dois dedos para ampliar/deslocar. Grade: {gridSpacingM.toLocaleString("pt-BR")} m por célula. Cores por categoria; acabamento, sombras e reflexos são apenas visuais. Nitidez de imagem adaptativa com limite de pixels para preservar o desempenho. Use a seleção de peças para acesso por teclado.</p>}
    </>}
  </div>;
}
