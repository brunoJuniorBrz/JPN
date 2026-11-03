import { roleLabels, type MaterialGroup, type PieceRole } from "@/domain/structure";

export interface MaterialRow {
  key: string;
  lengthMm: number;
  quantity: number;
  totalLengthM: number;
  massKg: number | null;
  pieceIds: string[];
}

export interface MaterialDisplayGroup {
  key: string;
  role: PieceRole;
  profileLabel: string;
  steelGrade: string;
  quantity: number;
  totalLengthM: number;
  massKg: number | null;
  rows: MaterialRow[];
}

/** Presentation only: the original engineering quantities and cut/export inputs
 * stay untouched. Different steel grades or role classifications never merge. */
export function groupMaterialsForDisplay(groups: readonly MaterialGroup[]): MaterialDisplayGroup[] {
  const mapped = new Map<string, MaterialDisplayGroup>();
  for (const group of groups) {
    const profile = group.profile;
    const signature = JSON.stringify([group.role, profile]);
    let target = mapped.get(signature);
    if (!target) {
      target = {
        key: signature,
        role: group.role,
        profileLabel: profile.name || profile.section || "Perfil a definir",
        steelGrade: profile.steelGrade,
        quantity: 0,
        totalLengthM: 0,
        massKg: 0,
        rows: [],
      };
      mapped.set(signature, target);
    }
    const quantity = group.pieceIds.length;
    target.quantity += quantity;
    target.totalLengthM += group.totalLengthM;
    target.massKg = target.massKg === null || group.massKg === null ? null : target.massKg + group.massKg;
    target.rows.push({
      key: group.key, lengthMm: group.lengthMm, quantity,
      totalLengthM: group.totalLengthM, massKg: group.massKg,
      pieceIds: [...group.pieceIds],
    });
  }
  return [...mapped.values()].map(group => ({
    ...group,
    rows: [...group.rows].sort((a, b) => a.lengthMm - b.lengthMm),
  }));
}

export interface PendingPresentation {
  text: string;
  count: number;
  sources: string[];
}

/** Navigate only known geometric/material registration issues. Unknown engineering
 * warnings have no inferred fix: never imply that a field edit approves design. */
export type PendingTarget = { step: 1 | 2; role?: PieceRole };

export function locatePending(issue: string): PendingTarget | null {
  const role = (Object.entries(roleLabels) as [PieceRole, string][])
    .find(([, label]) => issue.startsWith(`${label}:`))?.[0];
  if (role) return { step: 2, role };
  if (/tesour|terças|espaçamento|pain[eé]is|balanços|vãos|distribuição|5\.000 peças|pilares com altura positiva/i.test(issue))
    return { step: 2 };
  if (/medidas|largura|comprimento|altura|inclinação|caimento|cobertura|telhado|desnível/i.test(issue))
    return { step: 1 };
  return null;
}

export function locatePendingGroup(group: PendingPresentation): PendingTarget | null {
  if (!group.sources.length) return null;
  const destinations = group.sources.map(locatePending);
  if (destinations.some(value => value === null)) return null;
  const known = destinations as PendingTarget[];
  if (known.some(value => value.step !== known[0].step)) return null;
  const roles = [...new Set(known.map(value => value.role).filter((role): role is PieceRole => !!role))];
  return roles.length === 1 ? { step: known[0].step, role: roles[0] } : { step: known[0].step };
}

/** Summarize repeated material-registration notices without hiding their
 * original text; the detail disclosure keeps every warning accessible. */
export function summarizePending(pending: readonly string[]): PendingPresentation[] {
  const patterns = [
    { regex: /classe do a[cç]o/i, label: "classe do aço" },
    { regex: /massa por metro/i, label: "massa por metro" },
    { regex: /comprimento comercial/i, label: "comprimento comercial" },
  ];
  const recognized = new Map<string, { issues: string[]; roles: Set<string> }>();
  const other: PendingPresentation[] = [];
  const validRoles = new Set(Object.values(roleLabels));
  for (const issue of pending) {
    const colon = issue.indexOf(":");
    const role = colon >= 0 ? issue.slice(0, colon).trim() : "";
    const kind = patterns.find(pattern => pattern.regex.test(issue));
    if (colon < 0 || !validRoles.has(role) || !kind) {
      other.push({ text: issue, count: 1, sources: [issue] });
      continue;
    }
    const bucket = recognized.get(kind.label) ?? { issues: [], roles: new Set<string>() };
    bucket.issues.push(issue);
    bucket.roles.add(role);
    recognized.set(kind.label, bucket);
  }
  const categories = patterns.filter(pattern => recognized.has(pattern.label));
  const sameRoles = categories.length === patterns.length &&
    categories.every(pattern => {
      const roles = recognized.get(pattern.label)!.roles;
      return roles.size === recognized.get(patterns[0].label)!.roles.size &&
        [...roles].every(role => recognized.get(patterns[0].label)!.roles.has(role));
    });
  if (sameRoles) {
    const count = recognized.get(patterns[0].label)!.roles.size;
    const sources = categories.flatMap(pattern => recognized.get(pattern.label)!.issues);
    return [{
      text: `Faltam classe do aço, massa por metro e comprimento comercial (${count} grupos)`,
      count: sources.length, sources,
    }, ...other];
  }
  return [
    ...categories.map(pattern => {
      const bucket = recognized.get(pattern.label)!;
      return {
        text: `Falta ${pattern.label} (${bucket.roles.size} grupos)`,
        count: bucket.issues.length,
        sources: bucket.issues,
      };
    }),
    ...other,
  ];
}
