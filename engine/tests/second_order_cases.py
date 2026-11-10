"""Explicit synthetic physical references; never inferred geometry for a client."""
from math import pi

E, AREA, I, LENGTH = 200e9, .02, 2e-5, 4.
CANTILEVER_PCR = pi**2 * E * I / (4 * LENGTH**2)


def frame_case(kind="cantilever", segments=4, compression_n=0., horizontal_n=2000.):
    if kind == "cantilever":
        points = {"B0": (0., 0., 0.), "T0": (0., 0., 4.)}
        edges = [("C0", "B0", "T0")]
        bases, tops = ["B0"], ["T0"]
    else:
        points = {"B0": (0., 0., 0.), "B1": (6., 0., 0.),
                  "T0": (0., 0., 4.), "T1": (6., 0., 4.)}
        edges = [("C0", "B0", "T0"), ("C1", "B1", "T1"), ("R0", "T0", "T1")]
        bases, tops = ["B0", "B1"], ["T0", "T1"]
        if kind == "braced":
            # A declared welded FRAME brace, not an EA/L spring or wall stiffness.
            edges.append(("BRACE", "B0", "T1"))
        elif kind == "spatial":
            points.update({"B2": (0., 5., 0.), "B3": (6., 5., 0.),
                           "T2": (0., 5., 4.), "T3": (6., 5., 4.)})
            edges += [("C2", "B2", "T2"), ("C3", "B3", "T3"),
                      ("R1", "T2", "T3"), ("R2", "T0", "T2"), ("R3", "T1", "T3")]
            bases += ["B2", "B3"]
            tops += ["T2", "T3"]
        elif kind != "sway":
            raise ValueError("Unknown reference geometry")
    nodes = [dict(id=k, x_m=v[0], y_m=v[1], z_m=v[2]) for k, v in points.items()]
    members = []
    for mid, start, end in edges:
        chain = [start]
        for i in range(1, segments):
            name = f"{mid}-N{i}"
            xyz = [points[start][j] + (points[end][j]-points[start][j])*i/segments for j in range(3)]
            nodes.append(dict(id=name, x_m=xyz[0], y_m=xyz[1], z_m=xyz[2]))
            chain.append(name)
        chain.append(end)
        for i in range(segments):
            members.append(dict(id=f"{mid}-S{i}", start=chain[i], end=chain[i+1],
                                kind="frame", material="M", section="S", rotation_deg=0.,
                                release_start=[False]*6, release_end=[False]*6))
    source = "M43-P2 independent synthetic physical reference, not the Tom structure"
    loads = []
    for top in tops:
        loads += [dict(node=top, case="P", fx_n=0., fy_n=0., fz_n=-compression_n,
                       mx_nm=0., my_nm=0., mz_nm=0.),
                  dict(node=top, case="H", fx_n=horizontal_n/len(tops),
                       fy_n=.6*horizontal_n/len(tops) if kind == "spatial" else 0., fz_n=0.,
                       mx_nm=0., my_nm=0., mz_nm=0.)]
    return dict(
        schema_version="jpn.mixed3d/1", units="SI", theory="linear-elastic-frame-axial",
        project=dict(id="M43-P2-"+kind, revision=f"explicit-{segments}", source=source),
        nodes=nodes, members=members,
        materials=[dict(id="M", e_pa=E, g_pa=E/2.6, nu=.3, source=source, revision="1")],
        sections=[dict(id="S", area_m2=AREA, iy_m4=I,
                       iz_m4=3*I if kind == "spatial" else I, j_m4=I,
                       source=source, revision="1")],
        supports=[dict(node=n, restrained=[True]*6) for n in bases],
        cases=[dict(id="P", source=source), dict(id="H", source=source)],
        nodal_loads=loads, combinations=[dict(id="C", factors=dict(P=1., H=1.))],
    )
