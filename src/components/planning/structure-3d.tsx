"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { roles, type StructureModel } from "@/domain/structure";
import { fitIsometricCamera } from "./camera-fit";

export function Structure3D({ model, selected, onSelect }: { model: StructureModel; selected: string; onSelect: (id: string) => void }) {
  const extents = ["x", "y", "z"].map(k => Math.max(...model.nodes.map(n => n[k as "x" | "y" | "z"])) - Math.min(...model.nodes.map(n => n[k as "x" | "y" | "z"])));
  const gridSpacingM = Math.pow(10, Math.floor(Math.log10(Math.max(...extents.map(v => v / 1000), 1) / 8)));
  const host = useRef<HTMLDivElement>(null), select = useRef(onSelect), highlight = useRef<(id: string) => void>(() => {}), reset = useRef<() => void>(() => {});
  const [failure, setFailure] = useState("");
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    const canvas = document.createElement("canvas"), context = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "low-power" });
    if (!context) { const timer = setTimeout(() => setFailure("3D indisponível neste dispositivo. Use as vistas 2D acima."), 0); return () => clearTimeout(timer); }
    try { renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false, powerPreference: "low-power" }); }
    catch { const timer = setTimeout(() => setFailure("3D indisponível neste dispositivo. Use as vistas 2D acima."), 0); return () => clearTimeout(timer); }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0xf6f8f2); container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Modelo 3D da estrutura"); renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, .01, 100000);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false;
    const nodes = new Map(model.nodes.map(n => [n.id, new THREE.Vector3(n.x / 1000, n.z / 1000, -n.y / 1000)]));
    const colors = { column: 0x8f672b, topChord: 0x265c40, bottomChord: 0x42815c, web: 0x64734d, purlin: 0x357989 };
    const resources: (THREE.BufferGeometry | THREE.Material)[] = [];
    const targets: THREE.LineSegments[] = [];
    for (const role of roles) {
      const pieces = model.pieces.filter(p => p.role === role), points = pieces.flatMap(p => [nodes.get(p.start)!, nodes.get(p.end)!]);
      const geometry = new THREE.BufferGeometry().setFromPoints(points), material = new THREE.LineBasicMaterial({ color: colors[role] });
      const lines = new THREE.LineSegments(geometry, material); lines.userData.ids = pieces.map(p => p.id); scene.add(lines); targets.push(lines); resources.push(geometry, material);
    }
    const bounds = new THREE.Box3().setFromPoints([...nodes.values()]), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1), gridStep = Math.pow(10, Math.floor(Math.log10(span / 8)));
    const grid = new THREE.GridHelper(gridStep * 20, 20, 0xaab6a0, 0xdce2d5); grid.position.set(center.x, 0, center.z); scene.add(grid);
    resources.push(grid.geometry, ...(Array.isArray(grid.material) ? grid.material : [grid.material]));
    const lineGeometry = new THREE.BufferGeometry(), lineMaterial = new THREE.LineBasicMaterial({ color: 0xf15c17, depthTest: false });
    const marker = new THREE.Line(lineGeometry, lineMaterial); marker.renderOrder = 10; scene.add(marker); resources.push(lineGeometry, lineMaterial);
    const render = () => renderer.render(scene, camera);
    reset.current = () => { controls.target.copy(fitIsometricCamera(camera, bounds)); controls.update(); render(); };
    highlight.current = id => { const p = model.pieces.find(p => p.id === id); marker.visible = !!p; if (p) lineGeometry.setFromPoints([nodes.get(p.start)!, nodes.get(p.end)!]); render(); };
    const resize = () => { const width = Math.max(container.clientWidth, 1); renderer.setSize(width, 350); camera.aspect = width / 350; camera.updateProjectionMatrix(); reset.current(); };
    const observer = new ResizeObserver(resize); observer.observe(container); controls.addEventListener("change", render);
    const raycaster = new THREE.Raycaster(); raycaster.params.Line = { threshold: span / 180 };
    let startX = 0, startY = 0;
    const down = (e: PointerEvent) => { startX = e.clientX; startY = e.clientY; };
    const up = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = raycaster.intersectObjects(targets)[0];
      if (hit && hit.index !== undefined) select.current(hit.object.userData.ids[Math.floor(hit.index / 2)]);
    };
    const lost = (e: Event) => { e.preventDefault(); setFailure("O dispositivo perdeu o contexto gráfico. As vistas 2D continuam disponíveis."); };
    renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointerup", up); renderer.domElement.addEventListener("webglcontextlost", lost);
    reset.current(); resize();
    return () => { observer.disconnect(); controls.dispose(); resources.forEach(r => r.dispose()); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointerup", up); renderer.domElement.removeEventListener("webglcontextlost", lost); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); highlight.current = () => {}; };
  }, [model]);
  useEffect(() => { highlight.current(selected); }, [selected, model]);
  return <div><div ref={host} className="structure-3d" hidden={!!failure} />{failure ? <p role="status" className="notice">{failure}</p> : <><button className="button secondary" type="button" onClick={() => reset.current()}>Isométrica · ajustar 3D</button><p className="drawing-help">Arraste para girar; dois dedos para ampliar/deslocar. Grade: {gridSpacingM.toLocaleString("pt-BR")} m por célula. Cores por categoria. Use a seleção de peças para acesso por teclado.</p></>}</div>;
}
