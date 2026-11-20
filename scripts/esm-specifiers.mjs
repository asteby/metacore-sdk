// Utilidades compartidas por fix-dist-esm-imports y check-dist-esm-imports:
// localiza, con el parser de TypeScript, los especificadores de modulo REALES
// (import/export ... from, import('x'), import type('x'), import x = require)
// y no texto que parezca un import dentro de literales o comentarios.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

export function* walkDist(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walkDist(p)
    else if (/\.(m?js|d\.ts)$/.test(name)) yield p
  }
}

/** [{ spec, start, end, attrs }] — start/end cubren el texto entre comillas. */
export function moduleSpecifiers(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const out = []
  const add = (lit, hasAttrs) => {
    if (lit && ts.isStringLiteralLike(lit)) {
      out.push({ spec: lit.text, start: lit.getStart(sf) + 1, end: lit.getEnd() - 1, attrs: hasAttrs })
    }
  }
  const visit = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) {
      add(n.moduleSpecifier, !!n.attributes)
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(n.arguments[0], n.arguments.length > 1)
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) {
      add(n.argument.literal, false)
    } else if (ts.isExternalModuleReference(n)) {
      add(n.expression, false)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}
