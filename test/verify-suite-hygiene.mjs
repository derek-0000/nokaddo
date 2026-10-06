import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const testFilePattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/
const focusedAliases = new Set(['fdescribe', 'fit', 'ftest'])
const disabledAliases = new Set(['xdescribe', 'xit', 'xtest'])
const forbiddenMembers = new Set(['only', 'skip', 'skipIf', 'todo'])
const testRoots = new Set(['describe', 'it', 'suite', 'test'])
const violations = []

function collectTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) return collectTestFiles(path)
    return testFilePattern.test(entry.name) ? [path] : []
  })
}

function rootIdentifier(expression) {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isCallExpression(expression))
    return rootIdentifier(expression.expression)
  if (ts.isPropertyAccessExpression(expression)) {
    return rootIdentifier(expression.expression)
  }
  if (ts.isElementAccessExpression(expression)) {
    return rootIdentifier(expression.expression)
  }
  return undefined
}

function inspect(path) {
  const sourceText = readFileSync(path, 'utf8')
  const source = ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    extname(path).endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      let kind

      if (ts.isIdentifier(callee)) {
        if (focusedAliases.has(callee.text)) kind = 'focused test'
        if (disabledAliases.has(callee.text)) kind = 'disabled test'
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        testRoots.has(rootIdentifier(callee) ?? '') &&
        forbiddenMembers.has(callee.name.text)
      ) {
        kind = `${callee.name.text} test`
      }

      if (kind) {
        const location = source.getLineAndCharacterOfPosition(callee.getStart())
        violations.push(
          `${relative(root, path)}:${location.line + 1}:${location.character + 1} (${kind})`,
        )
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
}

for (const directory of ['src', 'test']) {
  for (const path of collectTestFiles(join(root, directory))) inspect(path)
}

if (violations.length > 0) {
  console.error(
    `Focused or disabled tests are not allowed:\n${violations.map((item) => `- ${item}`).join('\n')}`,
  )
  process.exitCode = 1
}
