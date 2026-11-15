"""Independent OpenSees corotational beam reference with explicit hinge DOFs."""
import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
E, A, I, J = 200e9, .03, 2e-5, 3e-5
RIGID = (False,)*6
PIN = (False,False,False,False,True,True)
PIN_AND_ROLL = (False,False,False,True,True,True)


def fixture(name):
    if name == "purlin-portal":
        nodes = {"a":(0,0,0),"b":(4,0,0),"c":(0,0,3),"d":(4,0,3),"m":(2,0,3)}
        members = [("L","a","c",RIGID,RIGID),("R","b","d",RIGID,RIGID),
                   ("P1","c","m",PIN,RIGID),("P2","m","d",RIGID,PIN_AND_ROLL)]
        supports = {"a":(1,)*6,"b":(1,)*6}
        preload = .72*math.pi**2*E*I/(4*3**2)
        light = {"d":(80.,0.,0.),"m":(0.,8.,-160.)}
        compressed = dict(light,c=(0.,0.,-preload),d=(80.,0.,-preload))
        return nodes,members,supports,light,compressed,("d",0),("L",0)
    nodes = {"a":(0,0,0),"b":(4,0,0),"m":(2,0,0)}
    members = [("B1","a","m",PIN,RIGID),("B2","m","b",RIGID,PIN_AND_ROLL)]
    supports = {"a":(1,)*6,"b":(0,1,1,1,1,1)}
    preload = .75*math.pi**2*E*I/4**2
    return nodes,members,supports,{"m":(0.,0.,-80.)},{"m":(0.,0.,-80.),"b":(-preload,0.,0.)},("m",2),("B1",1)


def native(name, mesh=32):
    import openseespy.opensees as ops

    if ops.version() != "3.8.0":
        raise RuntimeError("Expected the OpenSees version pinned in CI")
    nodes,members,supports,light,compressed,probe,cut = fixture(name)

    def analyze(loads):
        ops.wipe()
        ops.model("basic","-ndm",3,"-ndf",6)
        tags = {}
        node_id = 0
        element_id = 0
        ends = {}

        def add_node(xyz):
            nonlocal node_id
            node_id += 1
            ops.node(node_id,*xyz)
            return node_id

        for nid,xyz in nodes.items():
            tags[nid] = add_node(xyz)
            if nid in supports:
                ops.fix(tags[nid],*supports[nid])
        for mid,a,b,ri,rj in members:
            start,end = nodes[a],nodes[b]
            outer = [tags[a],tags[b]]
            for i,(nid,releases) in enumerate(zip((a,b),(ri,rj))):
                if any(releases):
                    duplicate = add_node(nodes[nid])
                    ops.equalDOF(tags[nid],duplicate,*(j+1 for j,release in enumerate(releases) if not release))
                    outer[i] = duplicate
            chain = [outer[0]]
            for i in range(1,mesh):
                chain.append(add_node([u+(v-u)*i/mesh for u,v in zip(start,end)]))
            chain.append(outer[1])
            vecxz = (1.,0.,0.) if start[0] == end[0] else (0.,0.,1.)
            tags_at_ends = element_id+1,element_id+mesh
            for i,j in zip(chain,chain[1:]):
                element_id += 1
                ops.geomTransf("Corotational",element_id,*vecxz)
                ops.element("elasticBeamColumn",element_id,i,j,A,E,E/2.6,J,I,I,element_id)
            ends[mid] = tags_at_ends
        ops.timeSeries("Linear",1)
        ops.pattern("Plain",1,1)
        for nid,force in loads.items():
            ops.load(tags[nid],*force,0.,0.,0.)
        ops.constraints("Transformation")
        ops.numberer("RCM")
        ops.system("BandGeneral")
        ops.test("NormUnbalance",1e-5,35)
        ops.algorithm("Newton")
        ops.integrator("LoadControl",.1)
        ops.analysis("Static")
        if ops.analyze(10):
            raise RuntimeError(f"OpenSees refused {name}")
        wrenches = {}
        for mid,(i,j) in ends.items():
            wrenches[mid] = [ops.eleForce(i)[3:6],ops.eleForce(j)[9:12]]
        displacement = ops.nodeDisp(tags[probe[0]],probe[1]+1)
        moment = math.hypot(*wrenches[cut[0]][cut[1]][1:])
        return {"displacement_m":displacement,"moment_nm":moment,"end_moments_nm":wrenches}

    first,second = analyze(light),analyze(compressed)
    return dict(first=first,second=second,amplification=second["displacement_m"]/first["displacement_m"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT/"opensees.json")
    args = parser.parse_args()
    results = {name:native(name) for name in ("purlin-portal","pinned-compression")}
    args.output.write_text(json.dumps(results,indent=2)+"\n",encoding="utf-8")
