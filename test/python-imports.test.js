const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyzeWorkspace } = require('../Analyzer');

function writeFile(root, relPath, content) {
  const fullPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

function importsOf(graph, filePath) {
  const node = graph.nodes.find(n => n.path === filePath);
  assert.ok(node, `expected node for ${filePath}`);
  return node.imports;
}

async function testSrcLayoutFromImport() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codeatlas-py-src-'));
  writeFile(root, 'pyproject.toml', `[tool.setuptools.packages.find]\nwhere = ["src"]\n`);
  const atomic = writeFile(root, 'src/synapse/atomic.py', `
def atomic_write_bytes(path, data):
    return None

def atomic_write_text(path, text):
    return None
`);
  writeFile(root, 'src/synapse/__init__.py', '');
  const decision = writeFile(root, 'src/synapse/decision.py', 'VALUE = 1\n');
  const skills = writeFile(root, 'src/synapse/skills.py', `
from synapse.atomic import atomic_write_bytes, atomic_write_text
from synapse import decision
import os
`);
  const app = writeFile(root, 'src/synapse/app.py', `import synapse.atomic\n`);
  const testFile = writeFile(root, 'tests/test_atomic.py', `
from synapse.atomic import atomic_write_bytes, atomic_write_text
`);

  const graph = await analyzeWorkspace(root, { saveIndex: false, maxFiles: 50 });
  const skillsImports = importsOf(graph, skills);

  assert.ok(skillsImports.includes(atomic), 'from synapse.atomic import names should resolve to atomic.py');
  assert.ok(skillsImports.includes(decision), 'from synapse import decision should resolve to decision.py');
  assert.deepStrictEqual(importsOf(graph, app), [atomic]);
  assert.deepStrictEqual(importsOf(graph, testFile), [atomic]);

  const skillsNode = graph.nodes.find(n => n.path === skills);
  assert.ok(!skillsNode.imports.includes(skills));
  assert.ok(graph.stats.externalDeps.some(dep => dep.name === 'os'));
  assert.ok(!graph.stats.externalDeps.some(dep => String(dep.name).includes('atomic_write')));
  assert.ok(!graph.stats.externalDeps.some(dep => dep.name === 'synapse'));
}

async function testFlatLayoutFromImport() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codeatlas-py-flat-'));
  const mymod = writeFile(root, 'mymod.py', `def foo():\n    return 1\n`);
  const app = writeFile(root, 'app.py', `from mymod import foo\n`);

  const graph = await analyzeWorkspace(root, { saveIndex: false, maxFiles: 20 });
  assert.deepStrictEqual(importsOf(graph, app), [mymod]);
}

async function testRelativeFromImport() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codeatlas-py-rel-'));
  const b = writeFile(root, 'pkg/b.py', `def x():\n    return 1\n`);
  writeFile(root, 'pkg/__init__.py', '');
  const a = writeFile(root, 'pkg/a.py', `from .b import x\n`);

  const graph = await analyzeWorkspace(root, { saveIndex: false, maxFiles: 20 });
  assert.deepStrictEqual(importsOf(graph, a), [b]);
}

async function main() {
  await testSrcLayoutFromImport();
  await testFlatLayoutFromImport();
  await testRelativeFromImport();
  console.log('python import tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
