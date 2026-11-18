"""Reproduce the frozen PR inventory and verify the integration candidate.

Requires complete Git history (CI checkout fetch-depth: 0). No GitHub token,
network requests, application imports, numerical changes or result approvals.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent
GIT = os.environ.get("JPN_GIT_EXECUTABLE", "git")
BRANCH = "integration/jpn-general-candidate"
# PR84 is now merged. Audit its frozen deliverable, not require every future
# engineering feature to remain byte-identical to its application sources.
# Its matrix/goldens/tests stay historical evidence; never re-record them in CI.
INTEGRATED_SHA = "6f473efa5350a498e444a7f006881a71e7ae9d59"

NOTES = {
    1: ("SUPERSEDED_NOT_MERGED", "Experimento 2D antigo substituído pelo pacote e oráculos atuais; não reinserir layout/dependências incompatíveis.", ["engine/validate.py"]),
    13: ("SUPERSEDED_NOT_MERGED", "Entradas Vercel antigas substituídas pelo WSGI autenticado atual, sem reativar deploy.", ["engine/tests/test_vercel_purlin_http.py"]),
    21: ("RESEARCH_UI_BLOCKED", "Biblioteca, componente e testes preservados; cartão não importado no cadastro. Revisão profissional SCI pendente no documento original.", ["src/domain/fire-feasibility-sp.test.ts"]),
    23: ("ADAPTED_EQUIVALENT", "Studio e controles móveis já conciliados na main; preservar versão mais recente.", ["tests/e2e/profiles-3d.spec.ts"]),
    38: ("EXACT_EQUIVALENT", "Oito arquivos de verificadores isolados já coincidem; sem merge duplicado.", ["engine/validate.py"]),
    39: ("ADAPTED_EQUIVALENT", "Abas, agrupamento e WebGL persistente já integrados; documento original recuperado.", ["tests/e2e/result-workspace.spec.ts"]),
    40: ("ADAPTED_EQUIVALENT", "Pendências acionáveis e busca já integradas; documento original recuperado.", ["tests/e2e/ux-actions.spec.ts"]),
    42: ("MERGED_RESEARCH", "Pesquisa histórica Kg preservada separadamente dos motores posteriores; seis ensaios independentes.", ["validation/geometric-stiffness-audit/kg_reference.py"]),
    45: ("MERGED_RESEARCH", "Cinco documentos históricos preservados; prompts antigos não substituem a missão ou plano atuais.", []),
    47: ("ADAPTED_EQUIVALENT", "Medição entre nós já conciliada com Studio móvel atual.", ["tests/e2e/studio-measurement.spec.ts"]),
    48: ("EXACT_EQUIVALENT", "Cinco arquivos de cargas uniformes já coincidem; manter contrato atual.", ["engine/validate.py"]),
    51: ("MERGED_REFERENCE_DATA", "Dados UFSC históricos com lacunas explícitas; não são entrada FE exata nem fatores normativos produtivos.", ["validation/ufsc-2023/validate-reference.mjs"]),
    52: ("ADAPTED_EQUIVALENT", "Fonte comercial Tom já preservada; teste posterior acompanha a implementação atual.", ["src/domain/tom-real-commercial.test.ts"]),
    54: ("ADAPTED_EQUIVALENT", "Demonstração Tom incorporada pela integração #61, sem repor interfaces antigas.", ["tests/e2e/m351-client-demo.spec.ts"]),
    55: ("ADAPTED_EQUIVALENT", "Preferências de apoios e ampliação preservadas por #61; não geram vínculos mecânicos.", ["tests/e2e/guided-roof-supports.spec.ts"]),
    57: ("EXACT_EQUIVALENT", "Quatro arquivos finais já coincidem com a navegação móvel integrada.", ["tests/e2e/m351-presentation-ux.spec.ts"]),
    62: ("EXACT_EQUIVALENT", "Sete arquivos finais do transporte já coincidem; incorporados na cadeia M36.", ["src/infrastructure/analysis/remote-purlin-runner.test.ts"]),
    63: ("PATCH_EQUIVALENT", "Implementação copiada com patch equivalente e validada na cadeia #64.", ["engine/validate.py"]),
    65: ("ADAPTED_EQUIVALENT", "Transporte e testes já conciliados; preservar correção posterior de estado compartilhado.", ["src/infrastructure/analysis/remote-purlin-runner.test.ts"]),
    66: ("ADAPTED_EQUIVALENT", "Conteúdo incorporado em #67; commits exclusivos restantes adicionam e retiram diagnóstico temporário.", ["tests/e2e/m36-support-interfaces.spec.ts"]),
    70: ("PATCH_EQUIVALENT", "Dois commits exclusivos têm patches equivalentes já na cadeia #71.", ["src/domain/orthogonal-roof-cells-real.test.ts"]),
    76: ("ADAPTED_EQUIVALENT", "Correção de zero com sinal já absorvida nos testes posteriores de fachadas.", ["src/domain/declared-facade-traction.test.ts"]),
}


def git(*args):
    return subprocess.check_output([GIT, *args], cwd=ROOT).decode("utf-8").strip()


def ancestor(a, b):
    return subprocess.run([GIT, "merge-base", "--is-ancestor", a, b], cwd=ROOT, capture_output=True).returncode == 0


# Reviewed amendments to protected tests, pinned by Git blob.
# PR #92 (M54): rejects facade loads duplicated under a disguised ID.
REVIEWED_AMENDMENTS = {
    # timeout explícito de 30 s no canvas 3D do CI (studio-next:32, quick-project:46)
    "tests/e2e/quick-project.spec.ts": "16614d78c2aebf3e397343b5f7738079cf4216ef",
    # Owner-requested M34ab fix: temporary output; read-only historical results.
    # Preserves the reviewed INT-1c/M44 checks and all original tolerances.
    "src/domain/m34ab-declared.test.ts": "7cbaf71bb161bad52054f2ed2f799e1611941fff",
    # M44-P1: NBR 14762 audit amendments (reviewed; was 477462c)
    "engine/tests/test_coldformed_design.py": "3ffd991d47f070b881c9024ea69b61154d7172c4",
    # INT-1a: E2E journeys declare the reviewed Z-up axes and expect /3 (reviewed)
    "tests/e2e/mixed-local.spec.ts": "0ae03da7e799ee6e558379fb8d6db7fd65bc0983",
    # INT-1a: E2E journeys declare the reviewed Z-up axes and expect /3 (reviewed)
    "tests/e2e/m351-client-demo.spec.ts": "f068080fac0fc9eec31919082136348d7c7f5ee1",
    # INT-1a: E2E journeys declare the reviewed Z-up axes and expect /3 (reviewed)
    "tests/e2e/m35-irregular.spec.ts": "0586f731992f8cc7c384a210ef47490d8d1560c9",
    # INT-1a: E2E journeys declare the reviewed Z-up axes and expect /3 (reviewed)
    "tests/e2e/loaded-mixed.spec.ts": "1ba5e3a0f1bfdadda560ed862e7e3c4e05b5393c",
    # INT-1a: E2E journeys declare the reviewed Z-up axes and expect /3 (reviewed)
    # UI F1 (owner-authorized test change, review in the UI PR): the old "4 Resultado" step button became the
    # Materiais studio step via the openResultTab helper; solver, binding and blocking checks unchanged (was 02be09e).
    "tests/e2e/integration-generated.spec.ts": "cd703922ab820690c1cc57eba21736ebcbffe407",
    # INT-1a: E2E journeys declare the reviewed Z-up axes and expect /3 (reviewed)
    "tests/e2e/integration-declared.spec.ts": "a2e8fd24b62fc0f7c3ad163b8dd62946c51511a0",   # INT-1f: now picks the simple view (supersedes 232a7db, INT-1a)
    # INT-1a: E2E journeys declare the reviewed Z-up axes and expect /3 (reviewed)
    "tests/e2e/general-integration.spec.ts": "7bf58daedae0e19f41ee68d13809c9b071d66f81",
    # INT-1a: E2E journeys declare the reviewed Z-up axes and expect /3 (reviewed)
    "tests/e2e/coldformed-design.spec.ts": "6f3cdefe76d0c086c98e3aef674371c63c00dd52",   # INT-1f: also checks the Studio verification layer for the NBR 14762 piece (supersedes de1ce15, INT-1a)
    "src/domain/declared-facade-mixed-real.test.ts": "a3df819018a8b38e864f72bdda5fd26ba1fa2acd",
    "src/domain/continuous-demands.test.ts": "b63c2411b4aec5a217ef49ad5b00281f4b2df8f4",
    "src/domain/whole-piece-deflection.test.ts": "751c665f3266cc52772a69ebeaf4ed99415128fe",
    "src/infrastructure/analysis/remote-mixed-runner.test.ts": "def70dcd3f98a3fc63c25de5630095d7d50a15f3",
    "src/domain/test-support/continuous-fixture.ts": "aa1251dfd582a4ec00354d6e84c8bd94e83d2d8c",
    # PR #105 (C1): continuous-demands test amended for local-axes /3
    # PR #105 (C1): continuous-demands test amended for local-axes /3
    # INT-2 deployment: keep authenticated main/preview guard and valid Vercel maxDuration (300s).
    "engine/vercel.json": "68e6752508b35faafd693c7df35c0470874e6d8e",
    # Deployment time budget now must respect Hobby 300 s, while retaining authenticated WSGI contract.
    "engine/tests/test_vercel_mixed_http.py": "f329dc2ce0c53dc07f8c5cb99a8d2ec76270d437",
    # N1 / PR #129 (approved by the project owner): single NBR 6123 edition (2023-corrected-2025);
    # edition literals and the speed-data SHA assertion updated, no numerical expectation changed.
    "src/domain/normative-origin.test.ts": "80a2d9c9ee73462acebc9d17711d845124e66ced",
    "src/domain/wind-speed.test.ts": "e5cf65b5ac01975374c50803a7c96b1eb3d0f65e",
    # #148: tests/e2e/presentation-3d.spec.ts — Studio F1 navigation-only adaptation, documented in docs/ui/REVIEW-E2E-STUDIO-148.md.
    "tests/e2e/presentation-3d.spec.ts": "a74f874614f2da6b8cf2c5b815c585391ec72cea",
    # #148: tests/e2e/spatial-analysis.spec.ts — Studio F1 navigation-only adaptation, documented in docs/ui/REVIEW-E2E-STUDIO-148.md.
    "tests/e2e/spatial-analysis.spec.ts": "68f2843c570444ae00af87b82c5fb7997e935e17",
    # #148: tests/e2e/studio-measurement.spec.ts — Studio F1 navigation-only adaptation, documented in docs/ui/REVIEW-E2E-STUDIO-148.md.
    "tests/e2e/studio-measurement.spec.ts": "7d8eb37822bd2c6e0d6d76043c3f5fff492d309d",
    # UI F1 (docs/ui/PLANO-UI.md, test changes authorized by the project owner; review in the UI PR):
    # the project screen became a studio. Result tabs / "Ferramenta de engenharia" select became
    # steps and an analysis-tools nav; navigation-only edits, no warning/blocking check removed.
    # PR #145: adaptation reviewed against F0–F6 original; adds Tesoura stage and resolves the tool only after opening Análise, without changing assertions.
    "tests/e2e/result-tabs.ts": "1c30655fa8702b0a5fbe29b9669c55897590d93e",              # helpers map old tabs/select to studio steps/tools
    "tests/e2e/planning.spec.ts": "867b51766b4ca077de22476ec27a26d2ef0aea49",            # "Resultado"/"Ir para resultado" -> Materiais; pendências em Verificação
    "tests/e2e/platform.spec.ts": "fdba218571b7e2da818bb4e0af6bd2f173e94587",            # "Resultado" -> Materiais
    "tests/e2e/profiles-3d.spec.ts": "f089b2f011589c798fd20a610fd092a745b0a219",         # "Resultado" -> Materiais
    "tests/e2e/result-workspace.spec.ts": "e7dfc14ec6db7bd4225c8e0d4a5f8d55330451d5",    # 3D stays visible across steps; keyboard on the steps list
    "tests/e2e/spatial-coordination.spec.ts": "7d18f889b1f769a8b1cfd07a194ffd0f8c1c9dbd",# "Resultado" -> Materiais
    "tests/e2e/spatial-preparation.spec.ts": "1e78b58ca8c5405c7e66ad71300e3e752d7f8ea4", # "Resultado" -> Materiais
    "tests/e2e/ux-actions.spec.ts": "e95dabbea2c3b1dd75e700ffb4d665710b1e9c94",          # tab "Modelo 3D" -> viewport region; pendências em Verificação
}

TREES = {}


def tree(ref):
    if ref not in TREES:
        TREES[ref] = {line.split("\t", 1)[1]: line.split()[2] for line in git("ls-tree", "-r", ref).splitlines()}
    return TREES[ref]


def verify_guards(snapshot):
    assert ancestor(snapshot["main_sha"], "HEAD"), "Candidate lost main ancestry"
    assert ancestor(snapshot["core_sha"], "HEAD"), "Candidate lost verified PR83 ancestry"
    assert ancestor(INTEGRATED_SHA, "HEAD"), "PR84 integration ancestry lost"
    # Existing application, physical preparation, numerical sources, tests and
    # golden files remain byte-identical to the verified P83 tree.
    changed = git("diff", "--name-only", "--diff-filter=MD", snapshot["core_sha"], INTEGRATED_SHA, "--", "src", "engine", "tests", "validation").splitlines()
    assert set(changed) <= {"engine/vercel.json"}, "Existing verified files overwritten: "+str(changed)
    assert not git("diff", "--name-only", "--diff-filter=D", snapshot["core_sha"], "HEAD"), "Deleted evidence/source"
    # Future reviewed source evolution is allowed; previously verified tests,
    # golden files and evidence cannot be silently rewritten or removed.
    historic = tree(INTEGRATED_SHA)
    current = tree("HEAD")
    protected = [p for p in historic if p.startswith(("tests/", "engine/tests/", "engine/section_tests/", "validation/")) or p.endswith(".test.ts")]
    for path in protected:
        if path == "validation/integration-general/audit.py":
            continue  # This runner evolves; the original stays in INTEGRATED_SHA.
        assert current.get(path) in (historic[path], REVIEWED_AMENDMENTS.get(path)), "Historical test/evidence drift: " + path
    for path in (ROOT/"vercel.json", ROOT/"engine/vercel.json"):
        flags = json.loads(path.read_text(encoding="utf-8"))["git"]["deploymentEnabled"]
        config = path.relative_to(ROOT).as_posix()
        if config == "engine/vercel.json" and current.get(config) == REVIEWED_AMENDMENTS[config]:
            assert flags == {"**": False, "main": True, "codex/int-2-*": True}, "Reviewed engine deployment guard changed"
        else:
            assert flags.get("main") is False and flags.get(BRANCH) is False, "Deployment guard changed: " + config
    assert "FireScreeningHint" not in (ROOT/"src/components/planning/quick-project-form.tsx").read_text(encoding="utf-8"), "Unreviewed SCI activated"


def record(snapshot):
    rows = []
    candidate_tree = tree(INTEGRATED_SHA)
    for original in snapshot["pull_requests"]:
        n, sha = original["number"], original["sha"]
        mb = git("merge-base", sha, original["base_sha"])
        files = git("diff", "--name-only", mb, sha).splitlines()
        in_main, in_core, in_candidate = [ancestor(sha, target) for target in (snapshot["main_sha"], snapshot["core_sha"], INTEGRATED_SHA)]
        status = "ALREADY_MAIN" if in_main else "ANCESTRY_PR83" if in_core else NOTES[n][0]
        note = "Ancestralidade preservada; não executar merge duplicado." if in_main or in_core else NOTES[n][1]
        tests = [f for f in files if (f.endswith((".test.ts", ".spec.ts")) or (Path(f).name.startswith("test_") and f.endswith(".py"))) and (ROOT/f).is_file()]
        tests += [f for f in NOTES.get(n, (None, None, []))[2] if (ROOT/f).is_file() and f not in tests]
        evidence = []
        source_tree = tree(sha)
        for f in files:
            source_blob, candidate_blob = source_tree.get(f), candidate_tree.get(f)
            evidence.append(dict(path=f, source_blob=source_blob,
                                 candidate_blob=candidate_blob,
                                 identical_git_blob=bool(source_blob is not None and source_blob == candidate_blob)))
        rows.append(dict(number=n, title=original["title"], source_sha=sha, source_branch=original["head"], base_branch=original["base"],
                         merge_base=mb, in_main_snapshot=in_main, in_pr83=in_core, candidate_ancestor=in_candidate,
                         exclusive_main=int(git("rev-list", "--count", sha, "^"+snapshot["main_sha"])),
                         exclusive_pr83=int(git("rev-list", "--count", sha, "^"+snapshot["core_sha"])),
                         status=status, decision=note, tests=tests, files=evidence,
                         prior_patch_equivalents=original.get("patch_equivalents", {})))
    result = dict(schema_version="jpn.integration-pr-matrix/1", main_sha=snapshot["main_sha"], core_sha=snapshot["core_sha"],
                  candidate_branch=BRANCH, snapshot_at=snapshot["snapshot_at"], pull_requests=rows)
    (HERE/"pr-matrix.json").write_text(json.dumps(result, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    lines = ["# Matriz dos PRs — integração geral", "", "Snapshot de 64 PRs abertos. A matriz JSON contém cada arquivo, blob de origem, hash da candidata e testes correspondentes.", "",
             "`main`: `"+snapshot["main_sha"]+"`; cadeia validada: #83 `"+snapshot["core_sha"]+"`.", "",
             "| PR | Funcionalidade | SHA | Estado | Testes / conferência |", "|---|---|---|---|---|"]
    for r in rows:
        paths = ", ".join("`"+p+"`" for p in r["tests"][:2]) or "Registro documental / conferência de blobs e ancestralidade"
        lines.append(f"| #{r['number']} | {r['title'].replace('|', '/')} | `{r['source_sha'][:7]}` | {r['status']} | {paths} |")
    (HERE/"PRS.md").write_text("\n".join(lines)+"\n", encoding="utf-8")
    # This is the partial order of actual PR HEAD ancestry, not their declared
    # base labels. Adapted/cherry-picked features do not create false edges.
    groups = {}
    by_number = {r["number"]: r for r in snapshot["pull_requests"]}
    for r in rows:
        groups.setdefault(r["source_sha"], []).append(r["number"])
    node = {n: "p"+str(min(numbers)) for numbers in groups.values() for n in numbers}
    graph = ["flowchart TD", '  main["main '+snapshot["main_sha"][:7]+'"]', '  candidate["'+BRANCH+'"]']
    for sha, numbers in groups.items():
        label = "/".join("#"+str(n) for n in sorted(numbers))+" "+sha[:7]
        graph.append('  '+node[numbers[0]]+'["'+label+'"]')
    edges = set()
    for original in snapshot["pull_requests"]:
        for parent in original["maximal_dependencies"]:
            if node[parent] != node[original["number"]]:
                edges.add((node[parent], node[original["number"]]))
        if original["behind_main"] == 0 and not any(by_number[n]["behind_main"] == 0 for n in original["maximal_dependencies"]):
            edges.add(("main", node[original["number"]]))
    for flag, target in (("in_main_snapshot", "main"), ("candidate_ancestor", "candidate")):
        included = {r["number"] for r in rows if r[flag]}
        parents = {node[n] for r in snapshot["pull_requests"] if r["number"] in included for n in r["maximal_dependencies"] if n in included}
        for n in included:
            if node[n] not in parents:
                edges.add((node[n], target))
    graph += ["  "+a+" --> "+b for a, b in sorted(edges)]
    (HERE/"ancestry-graph.mmd").write_text("\n".join(graph)+"\n", encoding="utf-8")


def verify(snapshot):
    verify_guards(snapshot)
    matrix = json.loads((HERE/"pr-matrix.json").read_text(encoding="utf-8"))
    candidate_tree = tree(INTEGRATED_SHA)
    assert len(matrix["pull_requests"]) == len(snapshot["pull_requests"]) == 64
    for row in matrix["pull_requests"]:
        assert ancestor(row["source_sha"], INTEGRATED_SHA) == row["candidate_ancestor"], "Ancestry drift: PR "+str(row["number"])
        for item in row["files"]:
            assert candidate_tree.get(item["path"]) == item["candidate_blob"], "File drift: "+item["path"]
        assert all((ROOT/p).is_file() for p in row["tests"]), "Mapped test missing"
    print("Integration audit PASS: frozen PR84 matrix; main + PR83 + PR84 ancestry; historical tests/goldens/evidence; deploy and SCI guards")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--record", action="store_true", help="Explicitly regenerate metadata after review; never used in CI")
    args = parser.parse_args()
    frozen = json.loads((HERE/"pr-snapshot.json").read_text(encoding="utf-8"))
    if args.record:
        record(frozen)
    verify(frozen)
