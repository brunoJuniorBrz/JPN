import ts from "typescript";

const flags = new Set(["computedStructuralApproval", "fabricationRelease", "computed_structural_approval", "fabrication_release", "approvedForFabrication", "approved_for_fabrication"]);
const fields = new Set([...flags, "releaseGate", "release_gate"]);
export type Occurrence = {field: string; line: number; valid: boolean};

/** Read executable properties/assignments, not comments or substring matches. */
export function scanReleaseContracts(source: string, filename: string): Occurrence[] {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Occurrence[] = [];
  const name = (n: ts.Node | undefined) => n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : undefined;
  function inspect(field: string | undefined, raw: ts.Expression, node: ts.Node) {
    if (!field) return;
    let value = raw;
    while (ts.isAsExpression(value) || ts.isParenthesizedExpression(value) || ts.isSatisfiesExpression(value)) value = value.expression;
    // Pin existing NOT_READY_BLOCKED status fields as well as named releaseGate.
    if (field === "status" && ts.isStringLiteral(value) && value.text === "NOT_READY_BLOCKED") {
      found.push({field: "blockedStatus", line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, valid: true});
      return;
    }
    if (!fields.has(field)) return;
    // Runtime schema literals are also part of the public contract.
    if (ts.isCallExpression(value) && value.expression.getText(file) === "z.literal" && value.arguments.length === 1) value = value.arguments[0];
    const valid = flags.has(field) ? value.kind === ts.SyntaxKind.FalseKeyword
      : ts.isStringLiteral(value) ? value.text === "NOT_READY_BLOCKED"
      : ts.isCallExpression(value) && ts.isIdentifier(value.expression) && value.expression.text === "buildEngineReleaseGate";
    found.push({field, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, valid});
  }
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node)) inspect(name(node.name), node.initializer, node);
    if (ts.isShorthandPropertyAssignment(node) && fields.has(node.name.text)) {
      found.push({field: node.name.text, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, valid: false});
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left;
      if (ts.isPropertyAccessExpression(left)) inspect(left.name.text, node.right, node);
      if (ts.isElementAccessExpression(left)) inspect(name(left.argumentExpression), node.right, node);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return found;
}
