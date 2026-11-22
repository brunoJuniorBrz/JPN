/**
 * Folha da Oficina: primeira prancha, escrita na língua de quem corta e solda.
 * Medidas em centímetros, nomes por extenso, lista de corte e lista de compra.
 * As folhas técnicas (eixos, coordenadas, pendências) continuam depois, para o engenheiro.
 */
import type { TrussEditor } from "@/domain/truss-editor";
import {
  lineTypeId, roofPurlinPositions, stations, trussLengthMm, trussOfLine, trussPiecesComplete, trussSummary, typeName,
  type TrussPiece,
} from "@/domain/truss-editor";
import type { CadBook, CadRect, Point2 } from "./cad-book";

/** Centímetros do jeito que se fala na obra: "52", "7,5", "598". */
export const cm = (mm: number) => {
  const v = Math.round(mm / 5) / 2; // meio centímetro
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Marca sem o lado (E-/D-): as duas águas têm as mesmas peças espelhadas. */
const baseMark = (p: TrussPiece) => p.mark.replace(/^[ED]-/, "");

type CutRow = { name: string; lengthMm: number; qty: number };
export type WorkshopType = { name: string; trusses: number; pieces: TrussPiece[]; editor: TrussEditor; cut: CutRow[] };

/** Peças de corte por tipo de tesoura, agrupadas por marca (as duas águas somam). */
export function workshopTypes(t: TrussEditor): WorkshopType[] {
  const byType = new Map<string, number[]>();
  for (let i = 0; i < t.trusses; i++) {
    const id = lineTypeId(t, i);
    byType.set(id, [...(byType.get(id) ?? []), i]);
  }
  return [...byType.entries()].map(([id, lines]) => {
    const editor = trussOfLine(t, lines[0]), pieces = trussPiecesComplete(editor);
    const rows = new Map<string, CutRow>();
    for (const p of pieces) {
      const mark = baseMark(p), name = pieceName(mark);
      const row = rows.get(mark) ?? { name, lengthMm: p.lengthMm, qty: 0 };
      row.qty += lines.length;
      rows.set(mark, row);
    }
    return { name: typeName(t, id), trusses: lines.length, pieces, editor, cut: [...rows.values()] };
  });
}
export function pieceName(mark: string) {
  const m = /^(BS|BI|M|D)(\d+)$/.exec(mark);
  if (!m) return mark;
  const n = Number(m[2]);
  if (m[1] === "BS") return n === 1 ? "Banzo de cima (pedaço 1)" : `Banzo de cima (pedaço ${n})`;
  if (m[1] === "BI") return n === 1 ? "Banzo de baixo (pedaço 1)" : `Banzo de baixo (pedaço ${n})`;
  return `${m[1] === "M" ? "Montante" : "Diagonal"} ${n}`;
}

/** Acrescenta a Folha da Oficina como PRIMEIRA folha do caderno. */
export function addWorkshopSheet(book: CadBook, t: TrussEditor) {
  const types = workshopTypes(t);
  const summary = trussSummary(t);
  const first = book.add("OFICINA", "Folha da oficina — tesoura, corte e compra (medidas em cm)");
  book.pages.unshift(book.pages.pop()!);
  const subtitle = "Para quem corta e solda · medidas em centímetros · folhas técnicas para o engenheiro vêm depois";
  first.subtitle = subtitle;
  const a = book.area;
  // Tesoura: faixa de cima. Com mais de um tipo, uma folha de oficina por tipo.
  types.forEach((type, i) => {
    const page = i === 0 ? first : book.add(`OFICINA ${i + 1}`, `Folha da oficina — ${type.name} (medidas em cm)`);
    if (i > 0) { book.pages.splice(i, 0, book.pages.pop()!); page.subtitle = subtitle; }
    page.draw.push(space => {
      drawTruss(book, space, { x: a.x, y: a.y + 92, width: a.width, height: a.height - 92 }, type, types.length > 1);
      const col = (k: number, w: number): CadRect => ({ x: a.x + k, y: a.y + 2, width: w, height: 82 });
      writeList(book, space, col(0, 118), "BANZOS, TERÇAS E PILARES", chordsAndPurlins(t, type, i === 0));
      writeList(book, space, col(122, 78), `MONTANTES (${t.web.designation})`, type.cut.filter(r => r.name.startsWith("Montante")).map(r => `${r.name}: ${cm(r.lengthMm)} cm · ${r.qty} pç`));
      writeList(book, space, col(204, 78), "DIAGONAIS", type.cut.filter(r => r.name.startsWith("Diagonal")).map(r => `${r.name}: ${cm(r.lengthMm)} cm · ${r.qty} pç`));
      writeList(book, space, col(286, a.width - 286), `COMPRAR (barras inteiras de ${String(t.stockMm / 1000).replace(".", ",")} m)`, [
        ...summary.lines.filter(l => !/Insumos|Mão de obra/i.test(l.item)).map(l => `${shortItem(l.item)}: ${shortQty(l.qty)}`),
        "",
        "Medidas em centímetros, de ponta a ponta da peça.",
        "Conferir na obra antes de cortar.",
        "Necessária conferência por engenheiro para validação.",
      ]);
    });
  });
  return first;
}

/** Item e quantidade da lista de compra sem o jargão do sistema. */
function shortItem(item: string) {
  return item.replace(/\s+mm\b/g, "");
}
const shortQty = (qty: string) => qty.replace(/\s*\(\d+ água\(s\), \d+ peça\(s\)\/água\)/, "");

function chordsAndPurlins(t: TrussEditor, type: WorkshopType, withPurlins: boolean) {
  const out: string[] = [];
  for (const [kind, name] of [["BS", "Banzo de cima"], ["BI", "Banzo de baixo"]] as const) {
    const rows = type.cut.filter(r => r.name.startsWith(name));
    if (!rows.length) continue;
    const qty = rows[0].qty;
    out.push(`${name}: ${rows.map(r => cm(r.lengthMm)).join(" + ")} cm · ${plural(qty, "vez", "vezes")}`);
    if (rows.length > 1) {
      const splice = type.pieces.find(p => p.mark.replace(/^[ED]-/, "") === `${kind}1`)!;
      out.push(`  emenda a ${cm(splice.lengthMm)} cm da ponta (em cima do montante)`);
    }
  }
  if (withPurlins) {
    const lines = roofPurlinPositions(t).length, bays = t.trusses - 1, piece = t.lengthMm / Math.max(1, bays);
    out.push(`Terças (${t.purlin.designation}): ${lines} linhas de ${cm(t.lengthMm)} cm`);
    out.push(`  = ${lines * bays} pedaços de ${cm(piece)} cm, emenda em cima da tesoura`);
    const step = t.purlinStepMm;
    out.push(`  uma a cada ${cm(step)} cm na inclinação`);
    if (t.support === "columns" || t.lineSupports.some(s => s.left === "column" || s.right === "column"))
      out.push(`Pilares (${t.column.designation}): ${cm(t.supportZMm)} cm cada`);
  }
  out.push(`Tesouras deste tipo: ${type.trusses}`);
  return out;
}

function writeList(book: CadBook, space: Parameters<CadBook["text"]>[0], r: CadRect, title: string, lines: string[]) {
  book.box(space, r, "MATERIAIS");
  book.text(space, [r.x + 2, r.y + r.height - 5], title, "MATERIAIS", 2.8);
  const H = 2.3, LEAD = 3.6, top = r.y + r.height - 11;
  const rows = lines.flatMap(l => l === "" ? [""] : book.wrap(l, r.width - 4, H));
  const perCol = Math.max(1, Math.floor((r.height - 13) / LEAD)), cols = Math.ceil(rows.length / perCol), w = (r.width - 4) / Math.max(1, cols);
  // Lista longa (muitos montantes) vira colunas dentro do mesmo quadro; letra menor se precisar, sem cortar texto.
  const h = cols > 1 ? Math.max(1.8, Math.min(H, w / (Math.max(...rows.map(l => l.length)) * .8))) : H;
  rows.forEach((l, i) => {
    const c = Math.floor(i / perCol), y = top - (i % perCol) * LEAD;
    if (l) book.text(space, [r.x + 2 + c * w, y], l, "MATERIAIS", h);
  });
}

function drawTruss(book: CadBook, space: Parameters<CadBook["text"]>[0], r: CadRect, type: WorkshopType, named: boolean) {
  const e = type.editor, L = trussLengthMm(e), total = e.roofKind === "two-slopes" ? 2 * L : L;
  const maxZ = Math.max(...type.pieces.map(p => Math.max(p.a[1], p.b[1])));
  const sx = (r.width - 30) / total, drawH = Math.min(r.height - 60, Math.max(28, maxZ * sx * 4));
  const sz = drawH / maxZ, x0 = r.x + 15, y0 = r.y + 34;
  const P = ([s, z]: [number, number]): Point2 => [x0 + s * sx, y0 + z * sz];
  const exaggeration = Math.round(sz / sx * 10) / 10;
  book.text(space, [r.x, r.y + r.height - 6],
    `TESOURA${named ? ` — ${type.name}` : ""} — fazer ${type.trusses} ${type.trusses === 1 ? "igual" : "iguais"} — medidas em cm`, "TEXTOS", 4);
  book.text(space, [r.x, r.y + r.height - 12], exaggeration >= 1.3
    ? `Altura desenhada ${String(exaggeration).replace(".", ",")} vezes maior para facilitar a leitura; as medidas escritas são as reais.`
    : "Desenho proporcional; as medidas escritas são as reais.", "TEXTOS", 2.3);
  for (const p of type.pieces) book.poly(space, [P(p.a), P(p.b)], p.kind === "BS" || p.kind === "BI" ? "PERFIS" : "BARRAS_AUXILIARES");
  // Montantes: número embaixo do banzo e altura real em cm.
  const montantes = type.pieces.filter(p => p.kind === "M");
  book.text(space, [r.x, y0 - 6], "Montante", "TEXTOS", 2.2);
  book.text(space, [r.x, y0 - 11], "Altura", "TEXTOS", 2.2);
  for (const m of montantes) {
    const [x] = P(m.a), n = baseMark(m).slice(1);
    book.text(space, [x - 1.2, y0 - 6], n, "TEXTOS", 2.2);
    book.text(space, [x - 2, y0 - 11], cm(m.lengthMm), "TEXTOS", 2.2);
  }
  // Diagonais: comprimento no meio da peça.
  for (const d of type.pieces.filter(p => p.kind === "D")) {
    const [ax, ay] = P(d.a), [bx, by] = P(d.b);
    book.text(space, [(ax + bx) / 2 + .8, (ay + by) / 2 - 1], cm(d.lengthMm), "COTAS", 2);
  }
  // Espaço entre montantes, em cima.
  const st = stations(e), sAll = e.roofKind === "two-slopes" ? [...st, ...st.map(s => 2 * L - s).filter(s => s > L + 1)].sort((u, v) => u - v) : st;
  const topY = y0 + drawH + 6;
  book.text(space, [r.x, topY], "Espaço", "TEXTOS", 2.2);
  for (let i = 1; i < sAll.length; i++) {
    const xa = x0 + sAll[i - 1] * sx, xb = x0 + sAll[i] * sx;
    book.text(space, [(xa + xb) / 2 - 2, topY], cm(sAll[i] - sAll[i - 1]), "COTAS", 2.1);
  }
  // Emendas dos banzos marcadas no desenho.
  for (const p of type.pieces.filter(p => (p.kind === "BS" || p.kind === "BI") && /1$/.test(baseMark(p)) && type.pieces.some(q => baseMark(q) === baseMark(p).replace(/1$/, "2")))) {
    const [x, y] = P(p.b);
    book.poly(space, [[x, y - 2.5], [x, y + 2.5]], "PENDENCIAS");
    book.text(space, [x + 1, y + (p.kind === "BS" ? 3 : 1.5)], "emenda", "PENDENCIAS", 2);
  }
  // Medidas gerais.
  book.text(space, [x0, y0 - 18], `Comprimento da tesoura: ${cm(total)} cm`, "TEXTOS", 2.6);
  book.text(space, [x0, y0 - 23], `Altura na ponta: ${cm(e.tipHeightMm)} cm · altura ${e.roofKind === "two-slopes" ? "no meio" : "no lado alto"}: ${cm(e.highHeightMm)} cm`, "TEXTOS", 2.6);
}
