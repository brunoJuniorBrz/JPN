"""Optional installation extras. Detection only: nothing is imported, nothing is installed, no numeric behaviour changes."""
from importlib.util import find_spec

SECTIONS_MODULES = ("sectionproperties", "shapely", "cytriangle")
# Schemas whose numerics need the `sections` extra (closed-form I/H design and the symmetric-I section path do not).
SECTIONS_SCHEMAS = frozenset({"jpn.section-analysis/1", "jpn.verified-coldformed/1", "jpn.verified-coldformed-batch/1"})


class SectionsExtraMissing(Exception):
    code = "SECTIONS_EXTRA_MISSING"

    def __init__(self, missing):
        self.missing = tuple(missing)
        super().__init__("Extra opcional 'sections' do engine não instalado (faltam: " + ", ".join(self.missing)
                         + "). Instale jpn-structural[sections] neste ambiente; nenhum resultado foi calculado.")


def missing_sections_modules():
    out = []
    for name in SECTIONS_MODULES:
        try:
            found = find_spec(name)
        except (ImportError, ValueError):
            found = None
        if found is None:
            out.append(name)
    return out


def require_sections_extra(schema_version, symmetric_i=False):
    if symmetric_i or schema_version not in SECTIONS_SCHEMAS:
        return
    missing = missing_sections_modules()
    if missing:
        raise SectionsExtraMissing(missing)
