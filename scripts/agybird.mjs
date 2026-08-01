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
