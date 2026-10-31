"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { StructureModel, Planning } from "@/domain/structure";
import type { RoofParameters } from "@/domain/project-details";
import { initialPresentationOptions, presentationEnvelope, type PresentationOptions, type WallLayout, type RoofColor, type RoofFinish } from "./presentation-scene";
import { drawPresentationAnnotations, presentationDimensions, dimensionLabels } from "./presentation-capture";
import { resolveSection } from "@/domain/profile-section";
import { fitIsometricCamera } from "./camera-fit";
import { buildProfileScene, pieceIdFromHit, viewerQuality, type ViewerMode } from "./profile-scene";

export function Structure3D({ model, roof, planning, projectName, selected, onSelect, onDemonstrate, onConfigureProfile }: { model: StructureModel; roof: RoofParameters; planning: Planning | null; projectName: string; selected: string; onSelect: (id: string) => void; onDemonstrate?: () => void; onConfigureProfile?: () => void }) {
  const extents = ["x", "y", "z"].map(k => Math.max(...model.nodes.map(n => n[k as "x" | "y" | "z"])) - Math.min(...model.nodes.map(n => n[k as "x" | "y" | "z"])));
  const gridSpacingM = Math.pow(10, Math.floor(Math.log10(Math.max(...extents.map(v => v / 1000), 1) / 8)));
  const host = useRef<HTMLDivElement>(null), select = useRef(onSelect), highlight = useRef<(id: string) => void>(() => {}), reset = useRef<() => void>(() => {});
  const [failure, setFailure] = useState("");
  const [pictureError, setPictureError] = useState("");
  const [presentationOptions, setPresentationOptions] = useState<PresentationOptions>(initialPresentationOptions);
  const optionsRef = useRef(presentationOptions);
  const applyOptions = useRef<(options:PresentationOptions)=>void>(()=>{});
  const capture = useRef<()=>void>(()=>{});
  const envelope = presentationEnvelope(roof, planning);
  const dimensions = envelope ? dimensionLabels(presentationDimensions(envelope)) : [];
  const [expanded, setExpanded] = useState(false);
  // Opening the viewer always starts with solid profiles, regardless of the mode last used.
  const [mode, setMode] = useState<ViewerMode | "finished">("profiles");
  const changeMode = useRef<(mode: ViewerMode | "finished") => void>(() => {});
  const focus = useRef<(id: string) => void>(() => {});
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    const quality = viewerQuality(model.pieces.length, navigator.hardwareConcurrency, (navigator as Navigator & { deviceMemory?: number }).deviceMemory);
    const canvas = document.createElement("canvas"), context = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "default" });
    if (!context) { const timer = setTimeout(() => setFailure("3D indisponível neste dispositivo. Use as vistas 2D acima."), 0); return () => clearTimeout(timer); }
    try { renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false, powerPreference: "default" }); }
    catch { const timer = setTimeout(() => setFailure("3D indisponível neste dispositivo. Use as vistas 2D acima."), 0); return () => clearTimeout(timer); }
    renderer.setClearColor(0xf6f8f2); container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Modelo 3D da estrutura"); renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, .01, 100000);
    renderer.shadowMap.enabled = !quality.low;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false;
    const profiles = buildProfileScene(model, quality.segments); scene.add(profiles.root);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa797, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(5, 12, 8); scene.add(sun);
    canvas.dataset.quality = quality.low ? "reduced" : "standard";
    canvas.dataset.solidCount = String(profiles.solidCount); canvas.dataset.fallbackCount = String(profiles.fallbackCount);
    canvas.dataset.framing = "whole-structure";
    const resources: (THREE.BufferGeometry | THREE.Material)[] = [];
    const bounds = profiles.bounds, center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1), gridStep = gridSpacingM;
    const grid = new THREE.GridHelper(gridStep * 20, 20, 0xaab6a0, 0xdce2d5); grid.position.set(center.x, 0, center.z); scene.add(grid);
    resources.push(grid.geometry, ...(Array.isArray(grid.material) ? grid.material : [grid.material]));
    const render = () => renderer.render(scene, camera);
    let framingBounds = bounds, activeMode: ViewerMode | "finished" = "profiles", disposed = false;
    type PresentationHandle = ReturnType<typeof import("./presentation-scene")["createPresentationScene"]>;
    let environment: PresentationHandle | null = null;
    const presentationBounds = envelope ? new THREE.Box3().setFromPoints([
      new THREE.Vector3(-3,0,3),new THREE.Vector3(envelope.widthM+3,envelope.highHeightM+1,-envelope.lengthM-3),
    ]) : bounds;
    const fitFull = () => {
      framingBounds = activeMode === "finished" ? bounds.clone().union(presentationBounds) : bounds;
      canvas.dataset.framing = "whole-structure";
      controls.target.copy(fitIsometricCamera(camera, framingBounds));controls.update();render();
    };
    changeMode.current = value => {
      activeMode = value;
      profiles.setMode(value === "finished" ? "profiles" : value);
      grid.visible = value !== "finished";
      canvas.dataset.mode = value;
      if(environment) environment.root.visible = value === "finished";
      if(value === "finished" && envelope && !environment) {
        void import("./presentation-scene").then(({createPresentationScene}) => {
          if(disposed || activeMode !== "finished" || environment) return;
          environment = createPresentationScene(envelope,model,optionsRef.current,render);
          scene.add(environment.root);
          canvas.dataset.contextLoaded = "true";
          fitFull();
        }).catch(()=>{if(!disposed)setPictureError("O ambiente 3D não pôde ser carregado. Retorne aos Perfis 3D.");});
      }
      if(value === "finished") fitFull(); else render();
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
    reset.current = fitFull;
    focus.current = id => {
      const item = profiles.instances.get(id), piece = model.pieces.find(p => p.id === id);
      if (!piece) return;
      let pieceBounds: THREE.Box3;
      if (item) { const matrix = new THREE.Matrix4(); item.mesh.getMatrixAt(item.index, matrix); pieceBounds = item.mesh.geometry.boundingBox!.clone().applyMatrix4(matrix); }
      else { const points = model.nodes.filter(n => n.id === piece.start || n.id === piece.end).map(n => new THREE.Vector3(n.x / 1000, n.z / 1000, -n.y / 1000)); pieceBounds = new THREE.Box3().setFromPoints(points); }
      framingBounds = pieceBounds; canvas.dataset.framing = "selected-piece"; controls.target.copy(fitIsometricCamera(camera, pieceBounds)); controls.update(); render();
    };
    highlight.current = id => { profiles.highlight(id); render(); };
    const resize = () => {
      const width = Math.max(container.clientWidth, 1), height = Math.max(container.clientHeight, 1);
      // iPhone/WebKit may report only a few CPU cores. Keep fine pixels even when
      // reducing mesh complexity; cap the total GPU framebuffer for stability.
      const pixelBudget = quality.low ? 1_200_000 : 2_400_000;
      const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, activeMode === "finished" ? 2 : quality.pixelRatio, Math.sqrt(pixelBudget / (width * height))));
      renderer.setPixelRatio(ratio); canvas.dataset.pixelRatio = ratio.toFixed(2);
      renderer.setSize(width, height);
      camera.aspect = width / height; camera.updateProjectionMatrix();
      controls.target.copy(fitIsometricCamera(camera, framingBounds)); controls.update(); render();
    };
    const observer = new ResizeObserver(resize); observer.observe(container); controls.addEventListener("change", render);
    const raycaster = new THREE.Raycaster(); raycaster.params.Line = { threshold: span / 180 };
    let startX = 0, startY = 0;
    const down = (e: PointerEvent) => { startX = e.clientX; startY = e.clientY; };
    const up = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
      if (activeMode === "finished") return;
      const hit = raycaster.intersectObjects(profiles.targets(), false)[0];
      const id = hit ? pieceIdFromHit(hit) : null; if (id) select.current(id);
    };
    const lost = (e: Event) => { e.preventDefault(); setFailure("O dispositivo perdeu o contexto gráfico. As vistas 2D continuam disponíveis."); };
    renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointerup", up); renderer.domElement.addEventListener("webglcontextlost", lost);
    resize();
    return () => { disposed = true; environment?.dispose(); observer.disconnect(); controls.removeEventListener("change", render); controls.dispose(); profiles.dispose(); resources.forEach(r => r.dispose()); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointerup", up); renderer.domElement.removeEventListener("webglcontextlost", lost); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); highlight.current = () => {}; changeMode.current = () => {}; applyOptions.current = () => {}; capture.current = () => {}; reset.current = () => {}; focus.current = () => {}; };
  }, [model, gridSpacingM, roof, planning, projectName]);
  useEffect(() => { changeMode.current(mode); }, [mode, model]);
  useEffect(() => { optionsRef.current = presentationOptions; applyOptions.current(presentationOptions); }, [presentationOptions]);
  useEffect(() => { highlight.current(selected); }, [selected, model]);
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [expanded]);
  const fallbackCount = model.pieces.filter(p => !resolveSection(p.profile).section).length;
  return <div className={expanded ? "structure-viewer structure-viewer--expanded" : "structure-viewer"}>
    {expanded && <div className="structure-viewer-heading"><strong>Apresentação da estrutura · 3D</strong><button type="button" className="button secondary" onClick={() => setExpanded(false)}>Fechar tela cheia</button></div>}
    {!failure && <div className="view-switch" role="group" aria-label="Modo de visualização 3D">{([["structural", "Estrutural"], ["profiles", "Perfis 3D"], ["mixed", "Misto"], ["finished", "Acabado"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} className={mode === value ? "selected" : ""} onClick={() => setMode(value)}>{label}</button>)}</div>}
    {!failure && mode !== "structural" && <div className="notice structure-profile-notice" data-testid="profile-coverage">
      <strong>{model.pieces.length - fallbackCount} peças com seção 3D · {fallbackCount} em linha.</strong>
      {fallbackCount > 0 && <><p>Para visualizar perfis reais, informe família, dimensões e espessura de cada categoria. O sistema não inventa medidas para projetos antigos.</p><div className="actions">{onConfigureProfile && <button type="button" className="button" onClick={onConfigureProfile}>Cadastrar dimensões</button>}{onDemonstrate && <button type="button" className="button secondary" onClick={onDemonstrate}>Ver demonstração com perfis</button>}</div></>}
    </div>}
    <div className="presentation-viewport">
      <div ref={host} className="structure-3d" hidden={!!failure} />
      {!failure && mode === "finished" && envelope && <div className="presentation-hud" aria-label="Cotas do pré-projeto">
        <span className="presentation-label">JPN · PRÉ-PROJETO VISUAL · NÃO DIMENSIONADO</span>
        {presentationOptions.showDimensions && <div className="presentation-dimensions">{dimensions.map(label=><span key={label}>{label}</span>)}</div>}
      </div>}
    </div>
    {!failure && mode === "finished" && <section className="presentation-controls" aria-label="Personalizar apresentação da obra">
      <div className="presentation-controls-head"><strong>Personalizar visualização</strong><span>Elementos cenográficos, sem alteração do orçamento ou da estrutura</span></div>
      <div className="presentation-settings">
        <label>Tipo de telha<select className="input" value={presentationOptions.roofFinish} onChange={e=>setPresentationOptions(o=>({...o,roofFinish:e.target.value as RoofFinish}))}><option value="trapezoidal">Trapezoidal (visual)</option><option value="sandwich">Termoacústica (visual)</option><option value="standing">Junta agrafada (visual)</option></select></label>
        <label>Cor do telhado<select className="input" value={presentationOptions.roofColor} onChange={e=>setPresentationOptions(o=>({...o,roofColor:e.target.value as RoofColor}))}>{Object.entries({graphite:"Grafite",silver:"Prata",white:"Branco",terracotta:"Terracota"}).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Paredes<select className="input" value={presentationOptions.walls} onChange={e=>setPresentationOptions(o=>({...o,walls:e.target.value as WallLayout}))}><option value="none">Sem paredes</option><option value="rear">Parede do fundo</option><option value="sides">Duas laterais</option><option value="three">Fundo + laterais</option><option value="closed">Quatro paredes</option></select></label>
        <label>Opacidade do telhado <strong>{Math.round(presentationOptions.roofOpacity*100)}%</strong><input type="range" min="0.15" max="1" step="0.05" value={presentationOptions.roofOpacity} onChange={e=>setPresentationOptions(o=>({...o,roofOpacity:Number(e.target.value)}))}/></label>
      </div>
      <div className="presentation-toggles">
        {([["showPerson","Pessoa (1,70 m)"],["showCar","Carro (4,50 m)"],["showDimensions","Exibir cotas"]] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={presentationOptions[key]} onChange={e=>setPresentationOptions(o=>({...o,[key]:e.target.checked}))}/>{label}</label>)}
      </div>
      <p className="field-hint">Telha, paredes, veículo e pessoa são ilustrativos e não compõem a lista de materiais. Mude para Perfis 3D para selecionar ou editar peças.</p>
    </section>
    {failure ? <p role="status" className="notice">{failure}</p> : <>
      <div className="actions structure-viewer-tools"><button type="button" className="button" onClick={() => setExpanded(v => !v)}>{expanded ? "Sair da tela cheia" : "Tela cheia"}</button><button className="button secondary" type="button" onClick={() => reset.current()}>Isométrica · ajustar 3D</button><button className="button secondary" type="button" disabled={!selected || mode === "finished"} onClick={() => focus.current(selected)}>Focar peça selecionada</button>{mode === "finished" && <button type="button" className="button" onClick={() => capture.current()}>Salvar imagem PNG</button>}</div>
      {pictureError && <p role="alert" className="field-error">{pictureError}</p>}
      <p className="drawing-help">Arraste para girar; dois dedos para ampliar/deslocar. Grade: {gridSpacingM.toLocaleString("pt-BR")} m por célula. Cores por categoria. Nitidez de imagem adaptativa com limite de pixels para preservar o desempenho. Use a seleção de peças para acesso por teclado.</p>
    </>}
  </div>;
}
