#!/usr/bin/env node

import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
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

  if (options.category === 'code') {
    if (options.mode === 'read') {
      common.push(READ_ONLY_POLICY);
    } else {
      common.push('Make only changes required by the user task. Preserve unrelated work and repository conventions.');
      common.push('Run the smallest relevant tests. Summarize changed files and verification results.');
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
  const step = firstDefined(event.step, event.data?.step, event.update, event);
  const name = firstDefined(step.tool_name, step.toolName, step.name, event.tool_name, event.toolName);
  const kind = firstDefined(step.type, event.subtype, event.event_type);
  if (!name && kind !== 'tool' && !String(event.type).includes('tool')) return null;
  return {
    id: String(firstDefined(step.id, step.step_id, event.step_id, event.id, name, 'tool')),
    name: String(firstDefined(name, 'unknown')),
    status: String(firstDefined(step.status, event.status, event.subtype, 'unknown')).toLowerCase(),
    arguments: firstDefined(step.arguments, step.input, event.arguments, event.input),
    result: firstDefined(step.result, step.output, event.result, event.output),
    error: firstDefined(step.error, event.error),
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

    state.conversationId = firstDefined(
      event.conversation_id,
      event.conversationId,
      event.session_id,
      event.sessionId,
      state.conversationId,
    );

    const toolUpdate = normalizeToolEvent(event);
    if (toolUpdate) mergeToolCall(state.toolCalls, toolUpdate);

    if (event.type === 'result') {
      state.sawTerminalResult = true;
      state.agyStatus = String(firstDefined(event.status, event.subtype, event.is_error ? 'error' : 'success'));
      state.response = firstDefined(event.response, event.result, event.message, event.content, state.response);
      state.usage = firstDefined(event.usage, event.stats, state.usage);
      const eventArtifacts = firstDefined(event.artifacts, event.files);
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

const PERMISSION_DENIAL = /permission(?:s)? (?:denied|declined|required)|not (?:executed|allowed|permitted)|user (?:denied|declined|rejected)|approval (?:denied|required)/i;
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

export function makeEnvelope({ category, parsed, outcome, exitCode, artifacts = parsed.artifacts }) {
  return {
    schema_version: 1,
    status: outcome.status,
    category,
    conversation_id: parsed.conversationId,
    response: parsed.response,
    tool_calls: parsed.toolCalls.map(({ error, ...tool }) => error === undefined ? tool : { ...tool, error }),
    artifacts,
    warnings: outcome.warnings,
    usage: parsed.usage,
    evidence: {
      agy_exit_code: exitCode,
      agy_status: parsed.agyStatus,
    },
  };
}

export async function main() {
  throw new Error('Runner execution is not implemented yet');
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`agybird: ${error.message}\n`);
    process.exitCode = 1;
  });
}
