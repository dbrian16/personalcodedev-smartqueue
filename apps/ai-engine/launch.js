#!/usr/bin/env node
/**
 * Cross-platform launcher for the Python AI engine.
 *
 * Resolves the interpreter once (a stock Windows box has `py`, not `python`),
 * installs only when requirements.txt has changed, and never blocks startup on a
 * failed install, since the Node backend falls back to its analytic ETA.
 */
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const REQUIREMENTS = path.join(HERE, 'requirements.txt');
const STAMP = path.join(HERE, '.deps-installed');

const CANDIDATES = process.platform === 'win32'
  ? [['py', ['-3']], ['python', []], ['python3', []]]
  : [['python3', []], ['python', []]];

/** Finds the first interpreter on PATH that actually executes. */
const resolvePython = () => {
  for (const [command, prefix] of CANDIDATES) {
    const probe = spawnSync(command, [...prefix, '-c', 'import sys; print(sys.version_info[0])'], {
      encoding: 'utf8',
      shell: false
    });
    if (probe.status === 0 && String(probe.stdout).trim().startsWith('3')) {
      return { command, prefix };
    }
  }
  return null;
};

const requirementsHash = () =>
  crypto.createHash('sha256').update(fs.readFileSync(REQUIREMENTS)).digest('hex');

const needsInstall = () => {
  try {
    return fs.readFileSync(STAMP, 'utf8').trim() !== requirementsHash();
  } catch (_error) {
    return true;
  }
};

const run = (python, args, options = {}) =>
  spawnSync(python.command, [...python.prefix, ...args], { stdio: 'inherit', ...options });

const main = () => {
  const python = resolvePython();

  if (!python) {
    console.error('[ai-engine] No Python 3 interpreter found on PATH.');
    console.error('[ai-engine] Install Python 3.10+ (https://www.python.org/downloads/) and re-run.');
    console.error('[ai-engine] The queue still works without it: the backend falls back to its');
    console.error('[ai-engine] built-in ETA formula whenever the AI engine is unreachable.');
    process.exit(process.argv.includes('--install-only') ? 1 : 0);
  }

  const installOnly = process.argv.includes('--install-only');

  if (installOnly || needsInstall()) {
    console.log('[ai-engine] Installing Python dependencies (first run or requirements changed)...');
    const install = run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', '-r', REQUIREMENTS]);
    if (install.status === 0) {
      fs.writeFileSync(STAMP, requirementsHash());
      console.log('[ai-engine] Dependencies ready.');
    } else {
      console.warn('[ai-engine] pip install failed. Starting anyway; the model falls back to');
      console.warn('[ai-engine] the analytic estimator when scikit-learn is unavailable.');
    }
  }

  if (installOnly) return;

  if (process.argv.includes('--test')) {
    const result = run(python, ['-m', 'unittest', 'discover', '-s', HERE, '-p', 'test_*.py', '-v'], { cwd: HERE });
    process.exit(result.status === null ? 1 : result.status);
  }

  const server = spawn(python.command, [...python.prefix, path.join(HERE, 'app.py')], {
    stdio: 'inherit',
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  const forward = (signal) => () => { if (!server.killed) server.kill(signal); };
  process.on('SIGINT', forward('SIGINT'));
  process.on('SIGTERM', forward('SIGTERM'));

  server.on('exit', (code) => process.exit(code === null ? 0 : code));
};

main();
