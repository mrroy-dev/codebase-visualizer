const fs = require('fs');
const path = require('path');

function stripJsonComments(jsonText) {
  if (!jsonText) return '';

  let output = '';
  let inString = false;
  let stringQuote = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < jsonText.length; i++) {
    const ch = jsonText[i];
    const next = jsonText[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        output += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      output += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === stringQuote) {
        inString = false;
        stringQuote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      output += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    output += ch;
  }

  return output;
}

function stripTrailingCommas(jsonText) {
  if (!jsonText) return '';

  let output = '';
  let inString = false;
  let stringQuote = null;
  let escaped = false;

  for (let i = 0; i < jsonText.length; i++) {
    const ch = jsonText[i];

    if (inString) {
      output += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === stringQuote) {
        inString = false;
        stringQuote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      output += ch;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < jsonText.length && /\s/.test(jsonText[j])) j++;
      const nextNonWs = jsonText[j];
      if (nextNonWs === '}' || nextNonWs === ']') {
        continue;
      }
    }

    output += ch;
  }

  return output;
}

function readJsoncFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const sanitized = stripTrailingCommas(stripJsonComments(raw));
    return JSON.parse(sanitized);
  } catch (e) {
    return null;
  }
}

function buildTsPathAliasMatchers(rootPath) {
  const configs = [
    readJsoncFile(path.join(rootPath, 'tsconfig.json')),
    readJsoncFile(path.join(rootPath, 'jsconfig.json')),
  ].filter(Boolean);

  const matchers = [];
  for (const cfg of configs) {
    const compilerOptions = cfg.compilerOptions || {};
    const paths = compilerOptions.paths || {};
    const baseUrl = compilerOptions.baseUrl || '.';
    const baseDir = path.resolve(rootPath, baseUrl);

    for (const [aliasPattern, targetPatternsRaw] of Object.entries(paths)) {
      const targetPatterns = Array.isArray(targetPatternsRaw) ? targetPatternsRaw : [targetPatternsRaw];
      if (!targetPatterns.length) continue;

      matchers.push({
        aliasPattern: String(aliasPattern),
        targetPatterns: targetPatterns.map(p => String(p)),
        baseDir,
      });
    }
  }

  return matchers;
}

function matchAliasPattern(importPath, aliasPattern) {
  if (!importPath || !aliasPattern) return null;

  if (aliasPattern === importPath) {
    return '';
  }

  const starIndex = aliasPattern.indexOf('*');
  if (starIndex === -1) return null;

  const prefix = aliasPattern.slice(0, starIndex);
  const suffix = aliasPattern.slice(starIndex + 1);

  if (!importPath.startsWith(prefix)) return null;
  if (suffix && !importPath.endsWith(suffix)) return null;

  return importPath.slice(prefix.length, suffix ? importPath.length - suffix.length : importPath.length);
}

// Import regex patterns per language
const IMPORT_PATTERNS = {
  js: [
    /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /export\s+.*\s+from\s+['"]([^'"]+)['"]/g,
  ],
  py: [
    /^import\s+([\w.]+)/gm,
    /^from\s+([\w.]+)\s+import/gm,
  ],
  go: [
    /import\s+"([^"]+)"/g,
    /import\s+\w+\s+"([^"]+)"/g,
  ],
  rs: [
    /use\s+([\w:]+)/g,
    /mod\s+(\w+)/g,
  ],
  java: [
    /import\s+([\w.]+);/g,
  ],
  cs: [
    /using\s+([\w.]+);/g,
  ],
  rb: [
    /require\s+['"]([^'"]+)['"]/g,
    /require_relative\s+['"]([^'"]+)['"]/g,
  ],
  php: [
    /require(?:_once)?\s*\(?['"]([^'"]+)['"]\)?/g,
    /include(?:_once)?\s*\(?['"]([^'"]+)['"]\)?/g,
    /use\s+([\w\\]+)/g,
  ],
};

const EXT_TO_LANG = {
  '.js': 'js', '.jsx': 'js', '.ts': 'js', '.tsx': 'js',
  '.mjs': 'js', '.cjs': 'js', '.vue': 'js', '.svelte': 'js',
  '.py': 'py', '.go': 'go', '.rs': 'rs',
  '.java': 'java', '.cs': 'cs', '.rb': 'rb', '.php': 'php',
  '.cpp': 'js', '.c': 'js', '.h': 'js',
};

const FILE_TYPE_COLORS = {
  '.js': '#f7df1e', '.jsx': '#61dafb', '.ts': '#3178c6', '.tsx': '#61dafb',
  '.py': '#3572a5', '.go': '#00add8', '.rs': '#dea584', '.java': '#b07219',
  '.cs': '#178600', '.rb': '#701516', '.php': '#4f5d95', '.vue': '#41b883',
  '.svelte': '#ff3e00', '.css': '#563d7c', '.scss': '#c6538c', '.html': '#e34c26',
  '.json': '#292929', '.md': '#083fa1', '.yaml': '#cb171e', '.toml': '#9c4221',
  default: '#6b7280'
};

const RESOLVABLE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.vue', '.svelte', '.go', '.rs',
  '.java', '.cs', '.rb', '.php'
];

const FLOW_STAGE_COLORS = {
  start: '#ffa657',
  main: '#58a6ff',
  core: '#3fb950',
  helpers: '#d2a8ff',
};

function shouldExclude(filePath, excludePatterns) {
  const normalized = filePath.replace(/\\/g, '/');
  return excludePatterns.some(pattern => {
    const cleanedPattern = String(pattern || '')
      .trim()
      .replace(/\/+$/g, '')
      .replace(/\.{3,}$/g, '')
      .replace(/^\.\/+/g, '');

    if (!cleanedPattern) return false;

    const regex = new RegExp(`(^|/)${cleanedPattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}(/|$)`);
    return regex.test(normalized);
  });
}

function getAllFiles(dirPath, excludePatterns, includeExtensions, maxFiles, allFiles = []) {
  if (allFiles.length >= maxFiles) return allFiles;

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (e) {
    return allFiles;
  }

  for (const entry of entries) {
    if (allFiles.length >= maxFiles) break;
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = fullPath.replace(dirPath, '').replace(/^[/\\]/, '');

    if (shouldExclude(fullPath, excludePatterns)) continue;

    if (entry.isDirectory()) {
      getAllFiles(fullPath, excludePatterns, includeExtensions, maxFiles, allFiles);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (includeExtensions.includes(ext)) {
        allFiles.push(fullPath);
      }
    }
  }

  return allFiles;
}

function packageNameFromImport(importPath, lang) {
  if (!importPath || importPath.startsWith('.') || importPath.startsWith('/')) {
    return null;
  }

  if (lang === 'py') {
    return importPath.replace(/^\.+/, '').split('.')[0] || null;
  }

  if (importPath.startsWith('@')) {
    const [scope, name] = importPath.split('/');
    return name ? `${scope}/${name}` : scope;
  }

  return importPath.split('/')[0];
}

function addExistingDirectory(dirPath, roots, seen) {
  if (!dirPath) return;
  const resolved = path.resolve(dirPath);
  if (seen.has(resolved)) return;

  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      seen.add(resolved);
      roots.push(resolved);
    }
  } catch (e) {
    // Ignore unreadable candidate roots.
  }
}

function collectPythonSourceRoots(rootPath) {
  const roots = [];
  const seen = new Set();
  const add = dirPath => addExistingDirectory(dirPath, roots, seen);

  add(rootPath);
  add(path.join(rootPath, 'src'));
  add(path.join(rootPath, 'lib'));
  add(path.join(rootPath, 'python'));

  const pyprojectPath = path.join(rootPath, 'pyproject.toml');
  try {
    if (fs.existsSync(pyprojectPath)) {
      const text = fs.readFileSync(pyprojectPath, 'utf8');

      for (const match of text.matchAll(/\bwhere\s*=\s*\[([^\]]*)\]/g)) {
        for (const item of match[1].matchAll(/["']([^"']+)["']/g)) {
          add(path.join(rootPath, item[1]));
        }
      }

      for (const match of text.matchAll(/\bfrom\s*=\s*["']([^"']+)["']/g)) {
        add(path.join(rootPath, match[1]));
      }

      for (const match of text.matchAll(/package-dir[^\n{]*\{[^}]*["']{2}\s*=\s*["']([^"']+)["']/g)) {
        add(path.join(rootPath, match[1]));
      }
    }
  } catch (e) {
    // Fall back to the default roots above.
  }

  const settings = readJsoncFile(path.join(rootPath, '.vscode', 'settings.json'));
  const extraPaths = settings?.['python.analysis.extraPaths']
    || settings?.['python.autoComplete.extraPaths']
    || [];
  if (Array.isArray(extraPaths)) {
    for (const extra of extraPaths) {
      add(path.resolve(rootPath, String(extra)));
    }
  }

  return roots;
}

function pythonFileToModuleName(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/').replace(/\.py$/i, '');
  if (!normalized || normalized === '__init__') return null;

  const parts = normalized.split('/').filter(Boolean);
  if (parts[parts.length - 1] === '__init__') parts.pop();
  if (!parts.length) return null;
  if (parts.some(part => part === '__pycache__' || part.startsWith('.'))) return null;

  return parts.join('.');
}

function scorePythonModuleFile(filePath, rootPath) {
  const rel = path.relative(rootPath, filePath).replace(/\\/g, '/');
  let score = rel.length;
  if (/(^|\/)tests?\//.test(rel)) score += 10000;
  if (rel.includes('/src/') || rel.startsWith('src/')) score -= 1000;
  if (filePath.endsWith(`${path.sep}__init__.py`) || filePath.endsWith('/__init__.py')) score -= 10;
  return score;
}

function buildPythonModuleIndex(allFiles, rootPath, sourceRoots) {
  const index = new Map();

  const register = (moduleName, filePath) => {
    if (!moduleName) return;
    const existing = index.get(moduleName);
    if (!existing || scorePythonModuleFile(filePath, rootPath) < scorePythonModuleFile(existing, rootPath)) {
      index.set(moduleName, filePath);
    }
  };

  for (const filePath of allFiles) {
    if (!filePath.toLowerCase().endsWith('.py')) continue;

    for (const sourceRoot of sourceRoots) {
      const rel = path.relative(sourceRoot, filePath);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
      register(pythonFileToModuleName(rel), filePath);
    }
  }

  return index;
}

function isLocalPythonName(importPath, pythonModuleIndex) {
  if (!importPath || !pythonModuleIndex) return false;
  const parts = importPath.replace(/^\.+/, '').split('.').filter(Boolean);
  for (let i = parts.length - 1; i > 0; i--) {
    if (pythonModuleIndex.has(parts.slice(0, i).join('.'))) return true;
  }
  return false;
}

function extractPythonImports(content) {
  const imports = new Set();
  const addImport = value => {
    const normalized = (value || '').trim().replace(/\s+/g, '');
    if (normalized && normalized !== '.') {
      imports.add(normalized);
    }
  };

  const importMatches = content.matchAll(/^\s*import\s+([^\n#]+)/gm);
  for (const match of importMatches) {
    const parts = match[1]
      .split(',')
      .map(part => part.trim().split(/\s+as\s+/i)[0]?.trim())
      .filter(Boolean);

    for (const part of parts) {
      addImport(part);
    }
  }

  const fromMatches = content.matchAll(/^\s*from\s+([.\w]+)\s+import\s+([^\n#]+)/gm);
  for (const match of fromMatches) {
    const modulePath = (match[1] || '').trim();
    const importedSymbols = (match[2] || '')
      .replace(/[()]/g, '')
      .split(',')
      .map(part => part.trim().split(/\s+as\s+/i)[0]?.trim())
      .filter(Boolean);

    addImport(modulePath);

    for (const symbol of importedSymbols) {
      if (symbol === '*') continue;
      addImport(modulePath ? `${modulePath}.${symbol}` : symbol);
    }
  }

  return [...imports];
}

function extractImports(content, filePath, lang) {
  if (lang === 'py') {
    return extractPythonImports(content);
  }

  const patterns = IMPORT_PATTERNS[lang] || [];
  const imports = new Set();

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) imports.add(match[1]);
    }
  }

  return [...imports];
}

function resolveCandidate(candidatePath, allFilePathSet) {
  if (allFilePathSet.has(candidatePath)) return candidatePath;

  for (const ext of RESOLVABLE_EXTENSIONS) {
    if (allFilePathSet.has(candidatePath + ext)) return candidatePath + ext;
  }

  for (const ext of RESOLVABLE_EXTENSIONS) {
    const indexPath = path.join(candidatePath, 'index' + ext);
    if (allFilePathSet.has(indexPath)) return indexPath;
  }

  if (allFilePathSet.has(path.join(candidatePath, '__init__.py'))) {
    return path.join(candidatePath, '__init__.py');
  }

  return null;
}

function resolvePythonImport(importPath, fromFile, allFilePathSet, rootPath, pythonModuleIndex) {
  const candidatePaths = [];
  const match = importPath.match(/^(\.+)?(.*)$/);
  const leadingDots = match?.[1] || '';
  const remainder = (match?.[2] || '').trim();

  if (leadingDots) {
    let baseDir = path.dirname(fromFile);
    const parentLevels = Math.max(leadingDots.length - 1, 0);
    for (let i = 0; i < parentLevels; i++) {
      baseDir = path.dirname(baseDir);
    }

    if (remainder) {
      candidatePaths.push(path.join(baseDir, ...remainder.split('.').filter(Boolean)));
    } else {
      candidatePaths.push(baseDir);
    }
  } else if (remainder) {
    if (pythonModuleIndex && pythonModuleIndex.has(remainder)) {
      return pythonModuleIndex.get(remainder);
    }

    // `from package.module import name` also records package.module.name.
    // If that last segment is a function/class, resolve the parent module.
    if (pythonModuleIndex && remainder.includes('.')) {
      const parentModule = remainder.slice(0, remainder.lastIndexOf('.'));
      if (pythonModuleIndex.has(parentModule)) {
        return pythonModuleIndex.get(parentModule);
      }
    }

    candidatePaths.push(path.join(rootPath, ...remainder.split('.').filter(Boolean)));
  }

  for (const candidate of candidatePaths) {
    const resolved = resolveCandidate(candidate, allFilePathSet);
    if (resolved) return resolved;
  }

  return null;
}

function resolveImport(importPath, fromFile, allFilePathSet, rootPath, lang, aliasMatchers = [], pythonModuleIndex = null) {
  if (lang === 'py') {
    const resolvedPython = resolvePythonImport(
      importPath,
      fromFile,
      allFilePathSet,
      rootPath,
      pythonModuleIndex
    );
    if (resolvedPython) {
      return resolvedPython;
    }
  }

  const candidatePaths = [];

  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    candidatePaths.push(path.resolve(path.dirname(fromFile), importPath));
  } else {
    for (const matcher of aliasMatchers) {
      const captured = matchAliasPattern(importPath, matcher.aliasPattern);
      if (captured === null) continue;

      for (const targetPattern of matcher.targetPatterns) {
        const replaced = targetPattern.includes('*')
          ? targetPattern.replace('*', captured)
          : targetPattern;

        const candidate = path.resolve(matcher.baseDir, replaced);
        const resolved = resolveCandidate(candidate, allFilePathSet);
        if (resolved) return resolved;
      }
    }

    candidatePaths.push(path.resolve(rootPath, importPath));

    if (importPath.startsWith('@/')) {
      candidatePaths.push(path.resolve(rootPath, 'src', importPath.slice(2)));
    }

    if (importPath.startsWith('~/')) {
      candidatePaths.push(path.resolve(rootPath, importPath.slice(2)));
    }
  }

  for (const candidate of candidatePaths) {
    const resolved = resolveCandidate(candidate, allFilePathSet);
    if (resolved) return resolved;
  }

  return null;
}

function getFileStats(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').length;
    return { lines, size: content.length, content };
  } catch (e) {
    return { lines: 0, size: 0, content: '' };
  }
}

function uniqueTrimmed(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function extractSymbols(content, lang) {
  if (!content) {
    return { functions: [], classes: [], exports: [] };
  }

  const functions = [];
  const classes = [];
  const exports = [];

  if (lang === 'js') {
    functions.push(
      ...[...content.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]),
      ...[...content.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g)].map(match => match[1]),
      ...[...content.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/g)].map(match => match[1]),
      ...[...content.matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]),
      ...[...content.matchAll(/\b([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)]
        .map(match => match[1])
        .filter(name => !['if', 'for', 'while', 'switch', 'catch', 'function'].includes(name))
    );
    classes.push(...[...content.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)].map(match => match[1]));
    exports.push(
      ...[...content.matchAll(/\bexport\s+(?:default\s+)?(?:class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map(match => match[1]),
      ...[...content.matchAll(/\bmodule\.exports\s*=\s*([A-Za-z_$][\w$]*)/g)].map(match => match[1]),
      ...[...content.matchAll(/\bexports\.([A-Za-z_$][\w$]*)\s*=/g)].map(match => match[1])
    );
  } else if (lang === 'py') {
    functions.push(...[...content.matchAll(/^\s*def\s+([A-Za-z_][\w]*)\s*\(/gm)].map(match => match[1]));
    classes.push(...[...content.matchAll(/^\s*class\s+([A-Za-z_][\w]*)\s*[\(:]/gm)].map(match => match[1]));
    exports.push(...[...content.matchAll(/^__all__\s*=\s*\[([^\]]*)\]/gm)]
      .flatMap(match => match[1].split(',').map(value => value.replace(/['"\s]/g, ''))));
  }

  return {
    functions: uniqueTrimmed(functions).slice(0, 25),
    classes: uniqueTrimmed(classes).slice(0, 15),
    exports: uniqueTrimmed(exports).slice(0, 20),
  };
}

function summarizeNode(node) {
  const parts = [];
  const stageText = node.stage === 'start'
    ? 'Entry or startup logic'
    : node.stage === 'core'
      ? 'Core business logic'
      : node.stage === 'helpers'
        ? 'Support or shared utility code'
        : 'Main orchestration code';

  parts.push(stageText);

  if (node.classes?.length) {
    parts.push(`Classes: ${node.classes.slice(0, 3).join(', ')}`);
  }

  if (node.functions?.length) {
    parts.push(`Functions: ${node.functions.slice(0, 4).join(', ')}`);
  }

  if (!node.classes?.length && !node.functions?.length) {
    parts.push(`Type: ${node.fileType}`);
  }

  return parts.join('. ');
}

function classifyCollaboration(importCount, importedByCount, crossStageLinks) {
  const totalLinks = importCount + importedByCount;

  if (totalLinks === 0) {
    return {
      status: 'isolated',
      impact: 'solo',
      summary: 'No local collaboration links yet.',
      score: 0,
    };
  }

  if (crossStageLinks >= 3 || (importCount >= 4 && importedByCount >= 4)) {
    return {
      status: 'collaborative',
      impact: 'bridge',
      summary: 'Connects multiple parts of the code flow.',
      score: totalLinks + crossStageLinks * 2,
    };
  }

  if (importedByCount >= 6) {
    return {
      status: 'collaborative',
      impact: 'hub',
      summary: 'A shared dependency reused by many files.',
      score: totalLinks + crossStageLinks,
    };
  }

  if (importCount >= 6) {
    return {
      status: 'active',
      impact: 'orchestrator',
      summary: 'Pulls together several files to do its work.',
      score: totalLinks + crossStageLinks,
    };
  }

  return {
    status: 'connected',
    impact: 'leaf',
    summary: 'Part of the local code flow with a focused role.',
    score: totalLinks + crossStageLinks,
  };
}

function buildProjectIndex(rootPath, nodes, edges, stats) {
  const edgeSources = new Map();
  const edgeTargets = new Map();

  for (const edge of edges) {
    if (!edgeSources.has(edge.source)) edgeSources.set(edge.source, []);
    if (!edgeTargets.has(edge.target)) edgeTargets.set(edge.target, []);
    edgeSources.get(edge.source).push(edge.target);
    edgeTargets.get(edge.target).push(edge.source);
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    rootPath,
    summary: {
      totalFiles: stats.totalFiles,
      totalEdges: stats.totalEdges,
      totalLines: stats.totalLines,
      languages: stats.languages,
      flowStages: stats.flowStages,
    },
    files: nodes.map(node => ({
      path: node.relativePath,
      fileType: node.fileType,
      stage: node.stage,
      lang: node.lang,
      ext: node.ext,
      lines: node.lines,
      size: node.size,
      collaboration: node.collaboration || null,
      crossStageLinks: node.crossStageLinks || 0,
      impactScore: node.impactScore || 0,
      isDeadCode: node.isDeadCode,
      isOrphan: node.isOrphan,
      isCircular: node.isCircular,
      hotspotScore: Math.round(node.hotspotScore || 0),
      hotspotLevel: node.hotspotLevel || 'low',
      summary: node.summary,
      functions: node.functions || [],
      classes: node.classes || [],
      exports: node.exports || [],
      imports: (edgeSources.get(node.id) || [])
        .map(target => path.relative(rootPath, target).replace(/\\/g, '/'))
        .slice(0, 50),
      usedBy: (edgeTargets.get(node.id) || [])
        .map(source => path.relative(rootPath, source).replace(/\\/g, '/'))
        .slice(0, 50),
    })),
  };
}

function saveProjectIndex(rootPath, projectIndex) {
  const indexDir = path.join(rootPath, '.codeatlas');
  const indexPath = path.join(indexDir, 'project-index.json');
  fs.mkdirSync(indexDir, { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(projectIndex, null, 2), 'utf8');
  return indexPath;
}

function detectFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();

  if (base.includes('test') || base.includes('spec')) return 'test';
  if (base.includes('config') || base.includes('.config.') || base === 'package.json') return 'config';
  if (base.includes('index') || base.includes('main') || base.includes('app') || base.includes('entry')) return 'entry';
  if (['.css', '.scss', '.sass', '.less', '.styl'].includes(ext)) return 'style';
  if (['.md', '.mdx', '.txt', '.rst'].includes(ext)) return 'docs';
  return 'module';
}

function detectFlowStage(relativePath, label, fileType) {
  const rel = relativePath.toLowerCase();
  const name = label.toLowerCase();
  const helperPattern = /(helper|helpers|util|utils|common|shared|types|typing|schema|constant|constants|format|formatter|parser|client|adapter|plugin|config|setting|settings|hook|hooks|theme|style|styles)/;
  const corePattern = /(core|engine|service|services|domain|model|models|memory|brain|store|state|logic|kernel|analysis|trainer|repo|repository|manager|pipeline)/;
  const startPattern = /(main|app|index|server|cli|run|bootstrap|entry|__main__)/;

  if (fileType === 'entry' || startPattern.test(name) || /(^|\/)(main|app|index|server|cli|run|bootstrap)(\.[^/]+)?$/.test(rel)) {
    return 'start';
  }

  if (helperPattern.test(rel) || fileType === 'config' || fileType === 'style' || fileType === 'docs') {
    return 'helpers';
  }

  if (corePattern.test(rel)) {
    return 'core';
  }

  return 'main';
}

function detectCircularDependencies(nodes, edges) {
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source).push(e.target);
    }
  }

  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const lowlink = new Map();
  const circular = new Set();
  let groupCount = 0;

  function strongconnect(v) {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) || []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v), indices.get(w)));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);

      if (scc.length > 1 || edges.some(e => e.source === v && e.target === v)) {
        groupCount++;
        for (const id of scc) circular.add(id);
      }
    }
  }

  for (const n of nodes) {
    if (!indices.has(n.id)) strongconnect(n.id);
  }

  return { circular, groupCount };
}

async function analyzeWorkspace(rootPath, options = {}) {
  const {
    excludePatterns = ['venv', '.venv', 'node_modules', '__pycache__', '.git', 'dist', 'build'],
    maxFiles = 500,
    includeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.vue', '.svelte'],
    onProgress = () => {},
    saveIndex = true,
  } = options;

  onProgress('Scanning directory tree...');
  const allFiles = getAllFiles(rootPath, excludePatterns, includeExtensions, maxFiles);
  const allFilePathSet = new Set(allFiles);

  // Build TS/JS path alias resolvers for React/Vite/TS projects.
  const aliasMatchers = buildTsPathAliasMatchers(rootPath);
  const pythonSourceRoots = collectPythonSourceRoots(rootPath);
  const pythonModuleIndex = buildPythonModuleIndex(allFiles, rootPath, pythonSourceRoots);

  onProgress(`Found ${allFiles.length} files. Analyzing dependencies...`);

  const nodes = [];
  const edges = [];
  const edgeSet = new Set();
  const externalDeps = new Map(); // external module name -> count

  for (let i = 0; i < allFiles.length; i++) {
    const filePath = allFiles[i];
    const relPath = path.relative(rootPath, filePath).replace(/\\/g, '/');
    const ext = path.extname(filePath).toLowerCase();
    const lang = EXT_TO_LANG[ext];

    if (i % 20 === 0) {
      onProgress(`Analyzing ${i + 1}/${allFiles.length} files...`);
    }

    const { lines, size, content } = getFileStats(filePath);
    const fileType = detectFileType(filePath);
    const stage = detectFlowStage(relPath, path.basename(filePath), fileType);
    const symbols = extractSymbols(content, lang);

    const node = {
      id: filePath,
      label: path.basename(filePath),
      path: filePath,
      relativePath: relPath,
      ext,
      lang,
      fileType,
      lines,
      size,
      color: FILE_TYPE_COLORS[ext] || FILE_TYPE_COLORS.default,
      stage,
      stageColor: FLOW_STAGE_COLORS[stage],
      folder: path.dirname(relPath),
      functions: symbols.functions,
      classes: symbols.classes,
      exports: symbols.exports,
      imports: [],
      importedBy: [],
    };

    node.summary = summarizeNode(node);
    nodes.push(node);

    if (lang && content) {
      const imports = extractImports(content, filePath, lang);
      const resolvedNode = nodes[nodes.length - 1];

      for (const imp of imports) {
        const resolved = resolveImport(
          imp,
          filePath,
          allFilePathSet,
          rootPath,
          lang,
          aliasMatchers,
          pythonModuleIndex
        );
        if (resolved) {
          const edgeKey = `${filePath}→${resolved}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edges.push({ source: filePath, target: resolved, type: 'import' });
          }
          if (!resolvedNode.imports.includes(resolved)) {
            resolvedNode.imports.push(resolved);
          }
        } else if (!(lang === 'py' && isLocalPythonName(imp, pythonModuleIndex))) {
          const pkgName = packageNameFromImport(imp, lang);
          if (pkgName) {
            externalDeps.set(pkgName, (externalDeps.get(pkgName) || 0) + 1);
          }
        }
      }
    }
  }

  // Compute importedBy
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  for (const edge of edges) {
    const target = nodeMap.get(edge.target);
    if (target && !target.importedBy.includes(edge.source)) {
      target.importedBy.push(edge.source);
    }
  }

  for (const node of nodes) {
    const neighborIds = [...new Set([...(node.imports || []), ...(node.importedBy || [])])];
    const crossStageLinks = neighborIds.filter(id => {
      const neighbor = nodeMap.get(id);
      return neighbor && neighbor.stage !== node.stage;
    }).length;
    const collaboration = classifyCollaboration(
      node.imports.length,
      node.importedBy.length,
      crossStageLinks
    );

    node.crossStageLinks = crossStageLinks;
    node.collaboration = collaboration;
    node.impactScore = collaboration.score;

    node.isDeadCode = node.importedBy.length === 0 && node.stage !== 'start';
    node.isOrphan = node.imports.length === 0 && node.importedBy.length === 0;
  }

  const { circular, groupCount: circularGroupCount } = detectCircularDependencies(nodes, edges);
  for (const node of nodes) {
    node.isCircular = circular.has(node.id);
  }

  for (const node of nodes) {
    node.hotspotScore = node.imports.length * 2 + node.importedBy.length * 3 + Math.log(node.lines + 1);
    if (node.hotspotScore > 60) node.hotspotLevel = 'critical';
    else if (node.hotspotScore > 30) node.hotspotLevel = 'high';
    else if (node.hotspotScore > 10) node.hotspotLevel = 'medium';
    else node.hotspotLevel = 'low';
  }

  const deadList = nodes.filter(n => n.isDeadCode);
  const orphanList = nodes.filter(n => n.isOrphan);
  const criticalHotspots = nodes.filter(n => n.hotspotLevel === 'critical');

  // Build folder structure
  const folders = new Map();
  for (const node of nodes) {
    const folder = node.folder || '.';
    if (!folders.has(folder)) {
      folders.set(folder, { name: folder, files: 0, lines: 0 });
    }
    const f = folders.get(folder);
    f.files++;
    f.lines += node.lines;
  }

  const deadCount = deadList.length;
  const orphanCount = orphanList.length;
  const criticalCount = criticalHotspots.length;
  const healthScore = Math.max(0, Math.min(100,
    100 - deadCount * 0.5 - circularGroupCount * 5 - criticalCount * 2
  ));

  // Compute stats
  const stats = {
    totalFiles: nodes.length,
    totalEdges: edges.length,
    totalLines: nodes.reduce((s, n) => s + n.lines, 0),
    averageDependencies: nodes.length ? Math.round((edges.length / nodes.length) * 10) / 10 : 0,
    orphanFiles: orphanCount,
    entryPoints: nodes.filter(n => n.fileType === 'entry').length,
    deadFiles: deadCount,
    circularGroupCount,
    healthScore: Math.round(healthScore),
    languages: [...new Set(nodes.map(n => n.lang).filter(Boolean))],
    topImported: nodes
      .filter(n => n.importedBy.length > 0)
      .sort((a, b) => b.importedBy.length - a.importedBy.length)
      .slice(0, 10)
      .map(n => ({ label: n.label, count: n.importedBy.length, path: n.relativePath })),
    hotspotLevels: {
      low: nodes.filter(n => n.hotspotLevel === 'low').length,
      medium: nodes.filter(n => n.hotspotLevel === 'medium').length,
      high: nodes.filter(n => n.hotspotLevel === 'high').length,
      critical: criticalCount,
    },
    topHotspots: [...nodes]
      .sort((a, b) => b.hotspotScore - a.hotspotScore)
      .slice(0, 10)
      .map(n => ({
        label: n.label,
        path: n.relativePath,
        score: Math.round(n.hotspotScore),
        imports: n.imports.length,
        importedBy: n.importedBy.length,
        lines: n.lines,
        level: n.hotspotLevel,
        id: n.id,
      })),
    deadCodeNodes: deadList.slice(0, 30).map(n => ({
      label: n.label,
      path: n.relativePath,
      id: n.id,
      stage: n.stage,
    })),
    circularNodes: nodes.filter(n => n.isCircular).slice(0, 20).map(n => ({
      label: n.label,
      path: n.relativePath,
      id: n.id,
    })),
    externalDeps: [...externalDeps.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count })),
    extensions: [...nodes.reduce((map, node) => {
      const key = node.ext || 'other';
      if (!map.has(key)) {
        map.set(key, { ext: key, count: 0, lines: 0, color: node.color });
      }
      const item = map.get(key);
      item.count += 1;
      item.lines += node.lines || 0;
      return map;
    }, new Map()).values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 16),
    fileTypes: Object.fromEntries(
      ['entry', 'module', 'test', 'config', 'style', 'docs'].map(t => [
        t, nodes.filter(n => n.fileType === t).length
      ])
    ),
    folders: [...folders.values()].sort((a, b) => b.files - a.files).slice(0, 20),
    flowStages: {
      start: nodes.filter(n => n.stage === 'start').length,
      main: nodes.filter(n => n.stage === 'main').length,
      core: nodes.filter(n => n.stage === 'core').length,
      helpers: nodes.filter(n => n.stage === 'helpers').length,
    },
    collaboration: {
      isolated: nodes.filter(n => n.collaboration?.status === 'isolated').length,
      connected: nodes.filter(n => n.collaboration?.status === 'connected').length,
      active: nodes.filter(n => n.collaboration?.status === 'active').length,
      collaborative: nodes.filter(n => n.collaboration?.status === 'collaborative').length,
    },
  };

  let projectIndexPath = null;
  if (saveIndex) {
    onProgress('Saving project index...');
    const projectIndex = buildProjectIndex(rootPath, nodes, edges, stats);
    projectIndexPath = saveProjectIndex(rootPath, projectIndex);
    stats.projectIndex = {
      path: projectIndexPath,
      relativePath: path.relative(rootPath, projectIndexPath).replace(/\\/g, '/'),
      fileCount: projectIndex.files.length,
      generatedAt: projectIndex.generatedAt,
    };
  }

  return { nodes, edges, stats, rootPath };
}

module.exports = { analyzeWorkspace };
