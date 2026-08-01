#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VALUE_OPTIONS = new Map([
  ['--category', 'category'],
  ['--cwd', 'cwd'],
  ['--mode', 'mode'],
  ['--reference', 'references'],
  ['--json-schema', 'jsonSchema'],
  ['--conversation', 'conversation'],
  ['--model', 'model'],
  ['--effort', 'effort'],
  ['--agent', 'agent'],
  ['--timeout', 'timeout'],
]);

const FLAG_OPTIONS = new Map([
  ['--sandbox', 'sandbox'],
]);

export function parseArgs(argv) {
  const options = {
    mode: 'read',
    references: [],
    sandbox: false,
    timeout: '10m',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (FLAG_OPTIONS.has(argument)) {
      options[FLAG_OPTIONS.get(argument)] = true;
      continue;
    }

    const property = VALUE_OPTIONS.get(argument);
    if (!property) {
      throw new Error(`Unknown option: ${argument}`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${argument} requires a value`);
    }
    index += 1;

    if (property === 'references') {
      options.references.push(value);
    } else {
      options[property] = value;
    }
  }

  if (!options.category) {
    throw new Error('--category is required');
  }
  if (!options.cwd) {
    throw new Error('--cwd is required');
  }
  return options;
}

function statOrNull(path) {
  try {
    return statSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function validateRequest(options) {
  if (!['code', 'image', 'general'].includes(options.category)) {
    throw new Error(`Invalid category: ${options.category}`);
  }
  if (!['read', 'write'].includes(options.mode)) {
    throw new Error(`Invalid mode: ${options.mode}`);
  }
  if (options.effort !== undefined && !['low', 'medium', 'high'].includes(options.effort)) {
    throw new Error(`Invalid effort: ${options.effort}`);
  }
  if (!isAbsolute(options.cwd)) {
    throw new Error('--cwd must be absolute');
  }

  const cwdStat = statOrNull(options.cwd);
  if (!cwdStat?.isDirectory()) {
    throw new Error('working directory does not exist or is not a directory');
  }

  if (options.references.length > 0 && options.category !== 'image') {
    throw new Error('--reference is only valid with category image');
  }
  for (const reference of options.references) {
    if (!isAbsolute(reference)) {
      throw new Error(`reference path must be absolute: ${reference}`);
    }
    const referenceStat = statOrNull(reference);
    if (!referenceStat) {
      throw new Error(`reference image does not exist: ${reference}`);
    }
    if (!referenceStat.isFile()) {
      throw new Error(`reference image is not a regular file: ${reference}`);
    }
  }

  if (!/^([1-9]\d*)(ms|s|m)$/.test(options.timeout)) {
    throw new Error(`Invalid timeout: ${options.timeout}; use a positive number followed by ms, s, or m`);
  }
  return options;
}

const READ_ONLY_POLICY = 'Do not create, edit, move, or delete files. Work read-only and cite concrete evidence for conclusions.';

export function buildDelegationPrompt(options, userPrompt) {
  const common = [
    'You are working through Agybird with the official Antigravity CLI.',
    'Follow the user task and the current Antigravity permission policy. Do not weaken permissions, expose credentials, or access unrelated data.',
  ];
  if (options.cwd) {
    common.push(`The authorized workspace is exactly: ${JSON.stringify(options.cwd)}. Resolve task paths inside it. Do not substitute an Antigravity scratch directory or another workspace.`);
  }

  if (options.category === 'code') {
    if (options.mode === 'read') {
      common.push(READ_ONLY_POLICY);
    } else {
      common.push('Make only changes required by the user task. Preserve unrelated work and repository conventions.');
      common.push('Run the smallest relevant tests when the current permission policy allows it; otherwise state that the caller must verify independently. Summarize changed files and verification results.');
    }
  } else if (options.category === 'image') {
    common.push('Use the built-in `generate_image` tool. Choose a clear ImageName and return every generated artifact path.');
    if (options.references.length > 0) {
      common.push(`Edit the supplied reference image using ImagePaths exactly as provided: ${JSON.stringify(options.references)}`);
    } else {
      common.push('Generate a new image from the user task; no reference image was supplied.');
    }
  } else if (options.mode === 'read') {
    common.push(READ_ONLY_POLICY);
  } else {
    common.push('Create or edit only the deliverables requested by the user task. Preserve unrelated files.');
  }

  common.push('<agybird_user_task>');
  common.push(userPrompt);
  common.push('</agybird_user_task>');
  return common.join('\n');
}

export function buildAgyArgs(options, delegatedPrompt) {
  const args = [
    '-p', delegatedPrompt,
    '--mode', options.mode === 'write' ? 'accept-edits' : 'plan',
    '--output-format', 'stream-json',
    '--print-timeout', options.timeout,
  ];
  const optionalValues = [
    ['jsonSchema', '--json-schema'],
    ['conversation', '--conversation'],
    ['model', '--model'],
    ['effort', '--effort'],
    ['agent', '--agent'],
  ];
  for (const [property, flag] of optionalValues) {
    if (options[property] !== undefined) {
      args.push(flag, options[property]);
    }
  }
  if (options.sandbox) {
    args.push('--sandbox');
  }
  return args;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeToolEvent(event) {
  const step = firstDefined(event.step, event.step_update, event.data?.step, event.update, event);
  const toolInfo = step.tool_info && typeof step.tool_info === 'object' ? step.tool_info : {};
  const name = firstDefined(
    step.tool_name,
    step.toolName,
    toolInfo.name,
    step.name,
    event.tool_name,
    event.toolName,
  );
  const kind = firstDefined(step.type, step.step_type, event.subtype, event.event_type);
  const eventName = firstDefined(event.type, event.event);
  if (!name && kind !== 'tool' && !String(eventName).includes('tool')) return null;
  return {
    id: String(firstDefined(step.id, step.step_id, step.step_index, event.step_id, event.id, name, 'tool')),
    name: String(firstDefined(name, 'unknown')),
    status: String(firstDefined(step.status, step.state, event.status, event.subtype, 'unknown')).toLowerCase(),
    arguments: firstDefined(
      step.arguments,
      step.input,
      step.tool_input,
      toolInfo.parameters,
      event.arguments,
      event.input,
    ),
    result: firstDefined(
      step.result,
      step.output,
      step.tool_output,
      toolInfo.output,
      event.result,
      event.output,
    ),
    error: firstDefined(step.error, toolInfo.error?.message, toolInfo.error, event.error),
  };
}

function mergeToolCall(toolCalls, update) {
  const existing = toolCalls.get(update.id) ?? { id: update.id, name: update.name, status: update.status };
  for (const [key, value] of Object.entries(update)) {
    if (value !== undefined) existing[key] = value;
  }
  toolCalls.set(update.id, existing);
}

export function createStreamParser() {
  let buffer = '';
  let lineNumber = 0;
  const state = {
    conversationId: null,
    response: null,
    structuredOutput: null,
    toolCalls: new Map(),
    artifacts: [],
    warnings: [],
    usage: null,
    sawTerminalResult: false,
    agyStatus: null,
  };

  function processLine(line) {
    lineNumber += 1;
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      state.warnings.push(`Malformed stream event at line ${lineNumber}`);
      return;
    }

    const eventName = firstDefined(event.type, event.event);
    const terminal = eventName === 'result' && event.result && typeof event.result === 'object'
      ? event.result
      : event;
    const stepUpdate = event.step_update && typeof event.step_update === 'object'
      ? event.step_update
      : null;

    state.conversationId = firstDefined(
      event.conversation_id,
      event.conversationId,
      event.session_id,
      event.sessionId,
      stepUpdate?.conversation_id,
      terminal.conversation_id,
      state.conversationId,
    );

    const toolUpdate = normalizeToolEvent(event);
    if (toolUpdate) mergeToolCall(state.toolCalls, toolUpdate);

    if (eventName === 'result') {
      state.sawTerminalResult = true;
      state.agyStatus = String(firstDefined(
        terminal.status,
        terminal.subtype,
        terminal.is_error ? 'error' : 'success',
      ));
      state.structuredOutput = firstDefined(terminal.structured_output, terminal.structuredOutput, state.structuredOutput);
      state.response = firstDefined(
        state.structuredOutput,
        terminal.response,
        terminal.message,
        terminal.content,
        state.response,
      );
      state.usage = firstDefined(terminal.usage, terminal.stats, state.usage);
      const eventArtifacts = firstDefined(terminal.artifacts, terminal.files);
      if (Array.isArray(eventArtifacts)) state.artifacts.push(...eventArtifacts);
    }
  }

  return {
    push(chunk) {
      buffer += String(chunk);
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);
        processLine(line);
      }
    },
    finish() {
      if (buffer.length > 0) processLine(buffer.replace(/\r$/, ''));
      buffer = '';
      return {
        ...state,
        toolCalls: [...state.toolCalls.values()],
      };
    },
  };
}

const PERMISSION_DENIAL = /permission(?:s)? (?:denied|declined|required)|denied permission|auto-denied|not (?:executed|allowed|permitted)|user (?:denied|declined|rejected)|approval (?:denied|required)/i;
const FAILED_TOOL_STATUS = new Set(['error', 'failed', 'failure', 'denied', 'blocked', 'cancelled', 'canceled']);

export function classifyOutcome({ parsed, exitCode, stderr }) {
  const warnings = [...parsed.warnings];
  const toolErrors = parsed.toolCalls.filter((tool) => FAILED_TOOL_STATUS.has(tool.status) || tool.error);
  const permissionText = [
    stderr,
    ...toolErrors.flatMap((tool) => [tool.status, tool.error]).filter(Boolean),
  ].join('\n');

  if (PERMISSION_DENIAL.test(permissionText)) {
    warnings.push('Antigravity permission policy blocked at least one requested action.');
    return { status: 'blocked', warnings };
  }
  if (exitCode !== 0) {
    warnings.push(`agy exited with code ${exitCode}`);
    return { status: 'error', warnings };
  }
  if (!parsed.sawTerminalResult) {
    warnings.push('Antigravity stream ended without a terminal result event.');
    return { status: 'error', warnings };
  }
  if (/error|failed|failure/i.test(parsed.agyStatus ?? '')) {
    warnings.push(`Antigravity reported terminal status: ${parsed.agyStatus}`);
    return { status: 'error', warnings };
  }
  if (toolErrors.length > 0) {
    warnings.push(`${toolErrors.length} Antigravity tool call(s) did not complete successfully.`);
    return { status: 'partial', warnings };
  }
  return { status: 'success', warnings };
}

export function makeEnvelope({
  category,
  parsed,
  outcome,
  exitCode,
  artifacts = parsed.artifacts,
  agyBinary,
  agyVersion,
}) {
  return {
    schema_version: 1,
    status: outcome.status,
    category,
    conversation_id: parsed.conversationId,
    response: parsed.response,
    tool_calls: parsed.toolCalls.map((tool) => ({
      id: tool.id,
      name: tool.name,
      status: tool.status,
    })),
    artifacts,
    warnings: outcome.warnings,
    usage: parsed.usage,
    evidence: {
      agy_exit_code: exitCode,
      agy_status: parsed.agyStatus,
      ...(agyBinary === undefined ? {} : { agy_binary: agyBinary }),
      ...(agyVersion === undefined ? {} : { agy_version: agyVersion }),
    },
  };
}

export function timeoutToMilliseconds(timeout) {
  const match = /^(\d+)(ms|s|m)$/.exec(timeout);
  if (!match) throw new Error(`Invalid timeout: ${timeout}`);
  const factors = { ms: 1, s: 1_000, m: 60_000 };
  return Number(match[1]) * factors[match[2]];
}

function canExecute(path) {
  try {
    accessSync(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveAgyBinary(env = process.env) {
  const pathEntries = String(env.PATH ?? '').split(delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? String(env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  for (const directory of pathEntries) {
    for (const extension of extensions) {
      const candidate = resolve(directory, `agy${extension}`);
      if (canExecute(candidate)) {
        return { command: candidate, prefixArgs: [], displayPath: candidate };
      }
    }
  }
  throw new Error('Official Antigravity CLI `agy` was not found on PATH');
}

function spawnCaptured(command, args, { cwd, env, timeoutMs, maxBytes = 16 * 1024 * 1024 }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let overflowed = false;

    function append(current, chunk) {
      if (Buffer.byteLength(current) + chunk.length > maxBytes) {
        overflowed = true;
        child.kill();
        return current;
      }
      return current + chunk.toString('utf8');
    }

    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.on('error', reject);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    timer.unref?.();

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolvePromise({
        stdout,
        stderr,
        exitCode: exitCode ?? (timedOut || overflowed ? 1 : 0),
        signal,
        timedOut,
        overflowed,
      });
    });
  });
}

async function readPrompt(stream = process.stdin, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > limit) throw new Error('Prompt exceeds the 1 MiB input limit');
    chunks.push(chunk);
  }
  const prompt = Buffer.concat(chunks).toString('utf8');
  if (!prompt.trim()) throw new Error('Prompt must be supplied through stdin');
  return prompt;
}

export async function runAgy(options, delegatedPrompt, env = process.env) {
  const binary = resolveAgyBinary(env);
  const preflight = await spawnCaptured(binary.command, [...binary.prefixArgs, '--version'], {
    cwd: options.cwd,
    env,
    timeoutMs: 5_000,
    maxBytes: 64 * 1024,
  });
  if (preflight.exitCode !== 0 || !preflight.stdout.trim()) {
    throw new Error('Official Antigravity CLI version preflight failed');
  }

  const execution = await spawnCaptured(
    binary.command,
    [...binary.prefixArgs, ...buildAgyArgs(options, delegatedPrompt)],
    {
      cwd: options.cwd,
      env,
      timeoutMs: timeoutToMilliseconds(options.timeout),
    },
  );
  return {
    ...execution,
    binaryPath: binary.displayPath,
    version: preflight.stdout.trim().split(/\r?\n/, 1)[0],
  };
}

function collectArtifactPaths(value, paths = [], key = '') {
  if (typeof value === 'string' && /(?:^|_)(?:image_?)?(?:file_?)?path$/i.test(key)) {
    paths.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectArtifactPaths(item, paths, key);
  } else if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) {
      collectArtifactPaths(child, paths, childKey);
    }
  }
  return paths;
}

function pathIsWithin(path, parent) {
  const pathRelative = relative(parent, path);
  return pathRelative === '' || (!pathRelative.startsWith('..') && !isAbsolute(pathRelative));
}

function imagePathsFromText(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/(?:[A-Za-z]:[\\/]|\/)[^`\n\r"'<>]*?\.(?:png|jpe?g|webp|gif)/gi)]
    .map((match) => match[0]);
}

export function verifyImageArtifacts(
  parsed,
  cwd,
  providerArtifactRoot = join(homedir(), '.gemini', 'antigravity-cli', 'brain'),
) {
  const imageTools = parsed.toolCalls.filter((tool) => tool.name === 'generate_image');
  const completed = imageTools.filter((tool) => ['done', 'completed', 'complete', 'success', 'succeeded'].includes(tool.status));
  if (completed.length === 0) {
    return { artifacts: [], error: imageTools.length === 0 ? 'No generate_image tool call was observed.' : null };
  }

  const canonicalCwd = realpathSync(cwd);
  const candidates = new Set([
    ...parsed.artifacts.flatMap((artifact) => typeof artifact === 'string' ? [artifact] : collectArtifactPaths(artifact)),
    ...completed.flatMap((tool) => collectArtifactPaths(tool.result)),
    ...imagePathsFromText(parsed.response),
  ]);
  const artifacts = [];
  const permittedRoots = [canonicalCwd];
  if (parsed.conversationId) {
    const conversationRoot = resolve(providerArtifactRoot, parsed.conversationId);
    if (statOrNull(conversationRoot)?.isDirectory()) {
      permittedRoots.push(realpathSync(conversationRoot));
    }
  }

  for (const candidate of candidates) {
    const absolutePath = isAbsolute(candidate) ? candidate : resolve(cwd, candidate);
    const artifactStat = statOrNull(absolutePath);
    if (!artifactStat?.isFile() || artifactStat.size === 0) continue;
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extname(absolutePath).toLowerCase())) continue;
    const canonicalArtifact = realpathSync(absolutePath);
    if (!permittedRoots.some((root) => pathIsWithin(canonicalArtifact, root))) continue;
    if (!artifacts.some((artifact) => artifact.path === canonicalArtifact)) {
      artifacts.push({ path: canonicalArtifact, size: artifactStat.size });
    }
  }

  return {
    artifacts,
    error: artifacts.length === 0 ? 'A completed generate_image tool call produced no valid image artifact.' : null,
  };
}

function fatalEnvelope(category, error) {
  return {
    schema_version: 1,
    status: 'error',
    category: category ?? null,
    conversation_id: null,
    response: null,
    tool_calls: [],
    artifacts: [],
    warnings: [error.message],
    usage: null,
    evidence: { agy_exit_code: null, agy_status: null },
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let options;
  try {
    options = validateRequest(parseArgs(argv));
    const userPrompt = await readPrompt();
    const delegatedPrompt = buildDelegationPrompt(options, userPrompt);
    const execution = await runAgy(options, delegatedPrompt, env);
    const parser = createStreamParser();
    parser.push(execution.stdout);
    const parsed = parser.finish();
    let outcome = classifyOutcome({ parsed, exitCode: execution.exitCode, stderr: execution.stderr });

    if (execution.timedOut) {
      outcome = { status: 'error', warnings: [...outcome.warnings, `agy timed out after ${options.timeout}`] };
    }
    if (execution.overflowed) {
      outcome = { status: 'error', warnings: [...outcome.warnings, 'agy output exceeded the 16 MiB limit'] };
    }

    let artifacts = parsed.artifacts;
    if (options.category === 'image') {
      const verified = verifyImageArtifacts(parsed, options.cwd);
      artifacts = verified.artifacts;
      if (verified.error && outcome.status === 'success') {
        outcome = { status: 'error', warnings: [...outcome.warnings, verified.error] };
      }
    }

    const envelope = makeEnvelope({
      category: options.category,
      parsed,
      outcome,
      exitCode: execution.exitCode,
      artifacts,
      agyBinary: execution.binaryPath,
      agyVersion: execution.version,
    });
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    if (execution.stderr) {
      process.stderr.write(`agybird: agy emitted ${Buffer.byteLength(execution.stderr)} bytes of diagnostics\n`);
    }
    process.exitCode = outcome.status === 'error' ? 1 : 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(fatalEnvelope(options?.category, error))}\n`);
    process.stderr.write(`agybird: ${error.message}\n`);
    process.exitCode = 1;
  }
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main();
}
