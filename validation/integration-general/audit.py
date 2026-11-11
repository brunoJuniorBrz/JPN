"""Reproduce the frozen PR inventory and verify the integration candidate.

Requires complete Git history (CI checkout fetch-depth: 0). No GitHub token,
network requests, application imports, numerical changes or result approvals.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent
GIT = os.environ.get("JPN_GIT_EXECUTABLE", "git")
BRANCH = "integration/jpn-general-candidate"

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


def digest(path):
    data = path.read_bytes()
    if path.suffix.lower() in {".ts", ".tsx", ".json", ".py", ".md", ".mjs", ".css", ".yml", ".yaml", ".toml", ".txt", ".lock", ".example"}:
        data = data.replace(b"\r\n", b"\n")
    return hashlib.sha256(data).hexdigest()


def verify_guards(snapshot):
    assert ancestor(snapshot["main_sha"], "HEAD"), "Candidate lost main ancestry"
    assert ancestor(snapshot["core_sha"], "HEAD"), "Candidate lost verified PR83 ancestry"
    # Existing application, physical preparation, numerical sources, tests and
    # golden files remain byte-identical to the verified P83 tree.
    changed = git("diff", "--name-only", "--diff-filter=MD", snapshot["core_sha"], "HEAD", "--", "src", "engine", "tests", "validation").splitlines()
    assert set(changed) <= {"engine/vercel.json"}, "Existing verified files overwritten: "+str(changed)
    assert not git("diff", "--name-only", "--diff-filter=D", snapshot["core_sha"], "HEAD"), "Deleted evidence/source"
    for path in (ROOT/"vercel.json", ROOT/"engine/vercel.json"):
        flags = json.loads(path.read_text(encoding="utf-8"))["git"]["deploymentEnabled"]
        assert flags["main"] is False and flags[BRANCH] is False, "Deployment guard changed"
    assert "FireScreeningHint" not in (ROOT/"src/components/planning/quick-project-form.tsx").read_text(encoding="utf-8"), "Unreviewed SCI activated"


def record(snapshot):
    rows = []
    trees = {}

    def tree(ref):
        if ref not in trees:
            trees[ref] = {line.split("\t", 1)[1]: line.split()[2] for line in git("ls-tree", "-r", ref).splitlines()}
        return trees[ref]

    candidate_tree = tree("HEAD")
    for original in snapshot["pull_requests"]:
        n, sha = original["number"], original["sha"]
        mb = git("merge-base", sha, original["base_sha"])
        files = git("diff", "--name-only", mb, sha).splitlines()
        in_main, in_core, in_candidate = [ancestor(sha, target) for target in (snapshot["main_sha"], snapshot["core_sha"], "HEAD")]
        status = "ALREADY_MAIN" if in_main else "ANCESTRY_PR83" if in_core else NOTES[n][0]
        note = "Ancestralidade preservada; não executar merge duplicado." if in_main or in_core else NOTES[n][1]
        tests = [f for f in files if (f.endswith((".test.ts", ".spec.ts")) or (Path(f).name.startswith("test_") and f.endswith(".py"))) and (ROOT/f).is_file()]
        tests += [f for f in NOTES.get(n, (None, None, []))[2] if (ROOT/f).is_file() and f not in tests]
        evidence = []
        source_tree = tree(sha)
        for f in files:
            exists = (ROOT/f).is_file()
            source_blob, candidate_blob = source_tree.get(f), candidate_tree.get(f)
            evidence.append(dict(path=f, source_blob=source_blob,
                                 candidate_sha256_lf=digest(ROOT/f) if exists else None,
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
    assert len(matrix["pull_requests"]) == len(snapshot["pull_requests"]) == 64
    for row in matrix["pull_requests"]:
        assert ancestor(row["source_sha"], "HEAD") == row["candidate_ancestor"], "Ancestry drift: PR "+str(row["number"])
        for item in row["files"]:
            if item["candidate_sha256_lf"] is not None:
                assert digest(ROOT/item["path"]) == item["candidate_sha256_lf"], "File drift: "+item["path"]
        assert all((ROOT/p).is_file() for p in row["tests"]), "Mapped test missing"
    print("Integration audit PASS: 64 PRs; main + PR83 ancestry; source/test/golden preservation; deploy and SCI guards")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--record", action="store_true", help="Explicitly regenerate metadata after review; never used in CI")
    args = parser.parse_args()
    frozen = json.loads((HERE/"pr-snapshot.json").read_text(encoding="utf-8"))
    if args.record:
        record(frozen)
    verify(frozen)
