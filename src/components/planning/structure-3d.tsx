"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { StructureModel } from "@/domain/structure";
import { resolveSection } from "@/domain/profile-section";
import { fitIsometricCamera } from "./camera-fit";
import { buildProfileScene, parseViewerMode, pieceIdFromHit, viewerQuality, VIEWER_MODE_KEY, type ViewerMode } from "./profile-scene";

export function Structure3D({ model, selected, onSelect, initialMode, autoFocus = false, onDemonstrate, onConfigureProfile }: { model: StructureModel; selected: string; onSelect: (id: string) => void; initialMode?: ViewerMode; autoFocus?: boolean; onDemonstrate?: () => void; onConfigureProfile?: () => void }) {
  const extents = ["x", "y", "z"].map(k => Math.max(...model.nodes.map(n => n[k as "x" | "y" | "z"])) - Math.min(...model.nodes.map(n => n[k as "x" | "y" | "z"])));
  const gridSpacingM = Math.pow(10, Math.floor(Math.log10(Math.max(...extents.map(v => v / 1000), 1) / 8)));
  const host = useRef<HTMLDivElement>(null), select = useRef(onSelect), highlight = useRef<(id: string) => void>(() => {}), reset = useRef<() => void>(() => {});
  const [failure, setFailure] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<ViewerMode>(() => { if (initialMode) return initialMode; try { return parseViewerMode(localStorage.getItem(VIEWER_MODE_KEY)); } catch { return "structural"; } });
  const changeMode = useRef<(mode: ViewerMode) => void>(() => {});
  const focus = useRef<(id: string) => void>(() => {}), initialFocusApplied = useRef(false);
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
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false;
    const profiles = buildProfileScene(model, quality.segments); scene.add(profiles.root);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa797, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(5, 12, 8); scene.add(sun);
    canvas.dataset.quality = quality.low ? "reduced" : "standard";
    canvas.dataset.solidCount = String(profiles.solidCount); canvas.dataset.fallbackCount = String(profiles.fallbackCount);
    const resources: (THREE.BufferGeometry | THREE.Material)[] = [];
    const bounds = profiles.bounds, center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1), gridStep = gridSpacingM;
    const grid = new THREE.GridHelper(gridStep * 20, 20, 0xaab6a0, 0xdce2d5); grid.position.set(center.x, 0, center.z); scene.add(grid);
    resources.push(grid.geometry, ...(Array.isArray(grid.material) ? grid.material : [grid.material]));
    const render = () => renderer.render(scene, camera);
    let framingBounds = bounds;
    changeMode.current = value => { profiles.setMode(value); canvas.dataset.mode = value; render(); };
    reset.current = () => { framingBounds = bounds; controls.target.copy(fitIsometricCamera(camera, bounds)); controls.update(); render(); };
    focus.current = id => {
      const item = profiles.instances.get(id), piece = model.pieces.find(p => p.id === id);
      if (!piece) return;
      let pieceBounds: THREE.Box3;
      if (item) { const matrix = new THREE.Matrix4(); item.mesh.getMatrixAt(item.index, matrix); pieceBounds = item.mesh.geometry.boundingBox!.clone().applyMatrix4(matrix); }
      else { const points = model.nodes.filter(n => n.id === piece.start || n.id === piece.end).map(n => new THREE.Vector3(n.x / 1000, n.z / 1000, -n.y / 1000)); pieceBounds = new THREE.Box3().setFromPoints(points); }
      framingBounds = pieceBounds; controls.target.copy(fitIsometricCamera(camera, pieceBounds)); controls.update(); render();
    };
    highlight.current = id => { profiles.highlight(id); render(); };
    const resize = () => {
      const width = Math.max(container.clientWidth, 1), height = Math.max(container.clientHeight, 1);
      // iPhone/WebKit may report only a few CPU cores. Keep fine pixels even when
      // reducing mesh complexity; cap the total GPU framebuffer for stability.
      const pixelBudget = quality.low ? 1_200_000 : 2_400_000;
      const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, quality.pixelRatio, Math.sqrt(pixelBudget / (width * height))));
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
      const hit = raycaster.intersectObjects(profiles.targets(), false)[0];
      const id = hit ? pieceIdFromHit(hit) : null; if (id) select.current(id);
    };
    const lost = (e: Event) => { e.preventDefault(); setFailure("O dispositivo perdeu o contexto gráfico. As vistas 2D continuam disponíveis."); };
    renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointerup", up); renderer.domElement.addEventListener("webglcontextlost", lost);
    resize();
    return () => { observer.disconnect(); controls.removeEventListener("change", render); controls.dispose(); profiles.dispose(); resources.forEach(r => r.dispose()); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointerup", up); renderer.domElement.removeEventListener("webglcontextlost", lost); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); highlight.current = () => {}; changeMode.current = () => {}; reset.current = () => {}; focus.current = () => {}; };
  }, [model, gridSpacingM]);
  useEffect(() => { changeMode.current(mode); try { localStorage.setItem(VIEWER_MODE_KEY, mode); } catch { /* Storage unavailable: retain this session's mode. */ } }, [mode, model]);
  useEffect(() => { highlight.current(selected); }, [selected, model]);
  useEffect(() => { if (autoFocus && selected && !initialFocusApplied.current) { initialFocusApplied.current = true; focus.current(selected); } }, [autoFocus, selected, model]);
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
    {!failure && <div className="view-switch" role="group" aria-label="Modo de visualização 3D">{([["structural", "Estrutural"], ["profiles", "Perfis 3D"], ["mixed", "Misto"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} className={mode === value ? "selected" : ""} onClick={() => setMode(value)}>{label}</button>)}</div>}
    {!failure && mode !== "structural" && <div className="notice structure-profile-notice" data-testid="profile-coverage">
      <strong>{model.pieces.length - fallbackCount} peças com seção 3D · {fallbackCount} em linha.</strong>
      {fallbackCount > 0 && <><p>Para visualizar perfis reais, informe família, dimensões e espessura de cada categoria. O sistema não inventa medidas para projetos antigos.</p><div className="actions">{onConfigureProfile && <button type="button" className="button" onClick={onConfigureProfile}>Cadastrar dimensões</button>}{onDemonstrate && <button type="button" className="button secondary" onClick={onDemonstrate}>Ver demonstração com perfis</button>}</div></>}
    </div>}
    <div ref={host} className="structure-3d" hidden={!!failure} />
    {failure ? <p role="status" className="notice">{failure}</p> : <>
      <div className="actions structure-viewer-tools"><button type="button" className="button" onClick={() => setExpanded(v => !v)}>{expanded ? "Sair da tela cheia" : "Tela cheia"}</button><button className="button secondary" type="button" onClick={() => reset.current()}>Isométrica · ajustar 3D</button><button className="button secondary" type="button" disabled={!selected} onClick={() => focus.current(selected)}>Focar peça selecionada</button></div>
      <p className="drawing-help">Arraste para girar; dois dedos para ampliar/deslocar. Grade: {gridSpacingM.toLocaleString("pt-BR")} m por célula. Cores por categoria. Nitidez de imagem adaptativa com limite de pixels para preservar o desempenho. Use a seleção de peças para acesso por teclado.</p>
    </>}
  </div>;
}
