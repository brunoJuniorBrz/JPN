import * as THREE from "three";
import type { RoofParameters } from "@/domain/project-details";
import type { Planning } from "@/domain/structure";
import { ridgeCapGeometry, roofReliefGeometry } from "./roof-relief";
import { roofSurface } from "./studio-view";

export type WallLayout = "none" | "rear" | "sides" | "three" | "closed";
export type RoofColor = "graphite" | "silver" | "white" | "terracotta";
export type RoofFinish = "trapezoidal" | "sandwich" | "standing";
export interface PresentationOptions {
  walls: WallLayout;
  roofColor: RoofColor;
  roofFinish: RoofFinish;
  roofOpacity: number;
  showPerson: boolean;
  showCar: boolean;
  showDimensions: boolean;
}
export const initialPresentationOptions: PresentationOptions = {
  walls: "rear", roofColor: "graphite", roofFinish: "trapezoidal", roofOpacity: 1,
  showPerson: true, showCar: true, showDimensions: true,
};
export const roofColors: Record<RoofColor, string> = {
  graphite: "#535b60", silver: "#b2bac0", white: "#e0e2d8", terracotta: "#a45142",
};
export interface PresentationEnvelope {
  widthM: number; lengthM: number; lowHeightM: number; highHeightM: number;
  typology: "mono" | "gable"; acrossWidth: boolean; positive: boolean;
  overhangStartM: number; overhangEndM: number; riseM: number;
}

export function presentationEnvelope(roof: RoofParameters, planning: Planning | null): PresentationEnvelope | null {
  if (roof.widthM === null || roof.lengthM === null || roof.lowHeightM === null || roof.slopePercent === null || !planning) return null;
  const { widthM, lengthM, lowHeightM } = roof, typology = planning.typology, acrossWidth = roof.fall.startsWith("width");
  const span = acrossWidth ? widthM : lengthM;
  const riseM = span * roof.slopePercent / 100 / (typology === "gable" ? 2 : 1);
  return { widthM, lengthM, lowHeightM, highHeightM: lowHeightM + riseM,
    typology, acrossWidth, positive: roof.fall.endsWith("positive"),
    overhangStartM: planning.overhangStartM ?? 0, overhangEndM: planning.overhangEndM ?? 0, riseM };
}
export function roofElevation(e: PresentationEnvelope, xM: number, yM: number) {
  const span = e.acrossWidth ? e.widthM : e.lengthM;
  const u = (e.acrossWidth ? xM : yM) / span;
  return e.lowHeightM + e.riseM * (e.typology === "gable" ? 1 - Math.abs(2 * u - 1) : e.positive ? 1 - u : u);
}
const scenePoint = (xM: number, yM: number, heightM: number) => new THREE.Vector3(xM, heightM, -yM);
export function roofPlaneCorners(e: PresentationEnvelope) {
  const span = e.acrossWidth ? e.widthM : e.lengthM;
  const longitudinalStart = -(e.overhangStartM), longitudinalEnd = (e.acrossWidth ? e.lengthM : e.widthM) + e.overhangEndM;
  const segments = e.typology === "gable" ? [[0, span / 2], [span / 2, span]] : [[0, span]];
  return segments.map(([u0, u1]) => {
    const point = (u: number, v: number) => {
      const x = e.acrossWidth ? u : v, y = e.acrossWidth ? v : u;
      return scenePoint(x, y, roofElevation(e, x, y) + .035);
    };
    return [point(u0, longitudinalStart), point(u1, longitudinalStart), point(u1, longitudinalEnd), point(u0, longitudinalEnd)] as const;
  });
}
function makeFallbackFigure() {
  const root = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: 0xbe8661 }), coat = new THREE.MeshStandardMaterial({ color: 0xc97b32 }), dark = new THREE.MeshStandardMaterial({color: 0x344356});
  const add = (material: THREE.Material, width: number,height:number,depth:number,x:number,y:number,z:number)=>{
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);mesh.position.set(x,y,z);root.add(mesh);
  };
  add(coat,.52,.56,.3,0,1.15,0);add(dark,.19,.75,.23,-.14,.49,0);add(dark,.19,.75,.23,.14,.49,0);
  add(skin,.16,.45,.18,-.36,1.13,0);add(skin,.16,.45,.18,.36,1.13,0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),skin);head.position.y=1.6;root.add(head);
  return root;
}
function makeFallbackCar() {
  const root = new THREE.Group(), body = new THREE.MeshStandardMaterial({color:0x36717b}), rubber = new THREE.MeshStandardMaterial({color:0x26292a});
  const main = new THREE.Mesh(new THREE.BoxGeometry(1.9,.54,4.5), body);main.position.y=.79;root.add(main);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55,.65,2.25),body);cab.position.set(0,1.23,.1);root.add(cab);
  for (const x of [-.97,.97]) for (const z of [-1.45,1.45]) {const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.18,10),rubber);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.4,z);root.add(wheel);}
  return root;
}
export function createPresentationScene(envelope: PresentationEnvelope, initial: PresentationOptions, invalidate: () => void, roofLiftM = 0) {
  const root = new THREE.Group(), fixed = new THREE.Group(), walls = new THREE.Group(), roofMeshes: THREE.Mesh[] = [], resources = new Set<{dispose():void}>();
  root.add(fixed, walls);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(envelope.widthM+6,envelope.lengthM+6),
    new THREE.MeshStandardMaterial({color:0xa9aca6,roughness:.95,metalness:0,envMapIntensity:.15}));
  floor.rotation.x = -Math.PI/2; floor.position.set(envelope.widthM/2,-.024,-envelope.lengthM/2);
  floor.receiveShadow = true; fixed.add(floor);resources.add(floor.geometry);resources.add(floor.material as THREE.Material);
  const addWall = (width: number,height:number,depth:number,x:number,z:number)=>{
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),new THREE.MeshStandardMaterial({color:0xcfccc2,roughness:.95,metalness:0,envMapIntensity:.15}));
    mesh.position.set(x,height/2,z);mesh.receiveShadow=true;mesh.castShadow=true;walls.add(mesh);
    resources.add(mesh.geometry);resources.add(mesh.material as THREE.Material);
  };
  const wallHeight = Math.max(1.7,Math.min(envelope.lowHeightM-.15,6));
  // Wall order: rear, left, right, front. All walls are visual only.
  addWall(envelope.widthM,wallHeight,.16,envelope.widthM/2,-envelope.lengthM);
  addWall(.16,wallHeight,envelope.lengthM,0,-envelope.lengthM/2);
  addWall(.16,wallHeight,envelope.lengthM,envelope.widthM,-envelope.lengthM/2);
  addWall(envelope.widthM,wallHeight,.16,envelope.widthM/2,0);
  const roofBase=roofPlaneCorners(envelope);
  // One shared PBR sheet material; relief is real geometry (see roof-relief.ts).
  const roofMaterial=new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:.5,metalness:.55,envMapIntensity:.9});
  resources.add(roofMaterial);
  let roofStyle="";
  for(let i=0;i<roofBase.length;i++){
    const mesh=new THREE.Mesh(new THREE.BufferGeometry(),roofMaterial);
    mesh.receiveShadow=true; mesh.castShadow=true; fixed.add(mesh);roofMeshes.push(mesh);
  }
  const ridgeCap=new THREE.Mesh(new THREE.BufferGeometry(),roofMaterial);
  ridgeCap.castShadow=true;ridgeCap.visible=false;fixed.add(ridgeCap);
  const rebuildRoof=(finish:RoofFinish)=>{
    // Each roof mesh owns exactly one geometry. Dispose the old buffer once,
    // then replace it; never also dispose an overlapping inventory of buffers.
    roofBase.forEach((corners,i)=>{
      const old=roofMeshes[i].geometry;
      roofMeshes[i].geometry=roofReliefGeometry(corners,finish,roofLiftM);
      old.dispose();
    });
    const cap=roofBase.length===2?ridgeCapGeometry(roofBase[0],roofBase[1],finish,roofLiftM):null;
    const oldCap=ridgeCap.geometry;
    ridgeCap.geometry=cap??new THREE.BufferGeometry();ridgeCap.visible=!!cap;
    oldCap.dispose();
  };
  let car: THREE.Group|null=null, person: THREE.Group|null=null, disposed=false, loadToken=0, opts=initial;
  let carSource:"pending"|"gltf"|"fallback"="pending", personSource:"pending"|"gltf"|"fallback"="pending";
  const disposeLoaded=(group:THREE.Group)=>group.traverse(object=>{
    if(object instanceof THREE.Mesh){object.geometry?.dispose();const arr=Array.isArray(object.material)?object.material:[object.material];for(const m of arr){m?.dispose();}}
  });
  const positionModel=(group:THREE.Group,kind:"car"|"person")=>{
    const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3());
    // Source GLB is in metres. Normalize the bounding box to the target real-world size
    // so the resulting visual markers remain correct if the asset changes.
    const desired=kind==="car"?4.5:1.7,actual=kind==="car"?size.z:size.y;
    if(actual>0)group.scale.setScalar(desired/actual);
    const scaledBounds=new THREE.Box3().setFromObject(group),low=scaledBounds.min.y;
    group.position.set(kind==="car"?envelope.widthM*.68:envelope.widthM*.25,-low,kind==="car"?-envelope.lengthM*.38:-envelope.lengthM*.24);
    group.traverse(child=>{if(child instanceof THREE.Mesh){child.castShadow=true;child.receiveShadow=true;}});
    root.add(group);
  };
  async function loadReferences(){
    const token=++loadToken;
    const {GLTFLoader}=await import("three/addons/loaders/GLTFLoader.js");
    if(disposed||token!==loadToken)return;
    const loader=new GLTFLoader();
    await Promise.all((["car","person"] as const).map(async kind=>{
      try{
        const gltf=await loader.loadAsync(`/presentation/${kind}-lowpoly.glb`);
        if(disposed||token!==loadToken){disposeLoaded(gltf.scene);return;}
        const group=gltf.scene;positionModel(group,kind);
        if(kind==="car"){car=group;carSource="gltf";}else{person=group;personSource="gltf";}
        group.visible=kind==="car"?opts.showCar:opts.showPerson;invalidate();
      }catch{
        if(disposed||token!==loadToken)return;
        const fallback=kind==="car"?makeFallbackCar():makeFallbackFigure();positionModel(fallback,kind);
        if(kind==="car"){car=fallback;carSource="fallback";}else{person=fallback;personSource="fallback";}
        fallback.visible=kind==="car"?opts.showCar:opts.showPerson;invalidate();
      }
    }));
  }
  function update(next:PresentationOptions){
    opts=next;
    const mask=next.walls==="none"?[]:next.walls==="rear"?[0]:next.walls==="sides"?[1,2]:next.walls==="three"?[0,1,2]:[0,1,2,3];
    walls.children.forEach((child,i)=>{child.visible=mask.includes(i);});
    if(roofStyle!==next.roofFinish){rebuildRoof(next.roofFinish);roofStyle=next.roofFinish;}
    const surface=roofSurface[next.roofColor];
    roofMaterial.color.set(roofColors[next.roofColor]);roofMaterial.metalness=surface.metalness;roofMaterial.roughness=surface.roughness;
    const translucent=next.roofOpacity<1;
    if(roofMaterial.transparent!==translucent){roofMaterial.transparent=translucent;roofMaterial.needsUpdate=true;}
    roofMaterial.opacity=next.roofOpacity;roofMaterial.depthWrite=!translucent;
    // A see-through roof must not hide the bars under its own shadow.
    for(const mesh of [...roofMeshes,ridgeCap])mesh.castShadow=next.roofOpacity>=.6;
    if(car)car.visible=next.showCar;
    if(person)person.visible=next.showPerson;
    invalidate();
  }
  update(initial);
  // GLB and GLTFLoader are downloaded only for the first activation of Acabado.
  void loadReferences();
  return {root,update,dispose:()=>{
    if(disposed)return;
    disposed=true;loadToken++;if(car)disposeLoaded(car);if(person)disposeLoaded(person);
    for(const mesh of roofMeshes)mesh.geometry.dispose();
    ridgeCap.geometry.dispose();
    resources.forEach(resource=>resource.dispose());root.clear();
  },status:()=>({loadedCar:!!car,loadedPerson:!!person,carSource,personSource}),roofMeshes,roofMaterial};
}
