#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

if (process.argv.includes('--version')) {
  process.stdout.write('agy 0.0.0-fake\n');
  process.exit(0);
}

const promptIndex = process.argv.indexOf('-p');
const prompt = promptIndex === -1 ? '' : process.argv[promptIndex + 1] ?? '';

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

emit({ type: 'init', conversation_id: 'fake-conversation' });

if (prompt.includes('CASE_DELAY')) {
  setTimeout(() => {
    emit({ type: 'result', status: 'success', response: 'too late' });
  }, 2_000);
} else if (prompt.includes('CASE_BLOCKED')) {
  process.stderr.write('Permission denied by current policy\n');
  emit({
    type: 'step_update',
    step: { id: 'blocked-1', type: 'tool', tool_name: 'write_file', status: 'denied' },
  });
  emit({ type: 'result', status: 'success', response: 'blocked' });
} else if (prompt.includes('CASE_ECHO_CONVERSATION')) {
  const index = process.argv.indexOf('--conversation');
  emit({ type: 'result', status: 'success', response: index === -1 ? 'none' : process.argv[index + 1] });
} else if (prompt.includes('CASE_NONZERO')) {
  process.stderr.write('provider failed\n');
  process.exitCode = 7;
} else if (prompt.includes('CASE_MALFORMED')) {
  process.stdout.write('not-json\n');
  emit({ type: 'result', status: 'success', response: 'recovered' });
} else if (prompt.includes('CASE_IMAGE_FAILURE')) {
  emit({
    type: 'step_update',
    step: {
      id: 'image-1',
      type: 'tool',
      tool_name: 'generate_image',
      status: 'failed',
      error: 'generation failed',
    },
  });
  emit({ type: 'result', status: 'success', response: 'failed image' });
} else if (prompt.includes('CASE_IMAGE_MISSING')) {
  emit({
    type: 'step_update',
    step: {
      id: 'image-1',
      type: 'tool',
      tool_name: 'generate_image',
      status: 'completed',
      result: { path: join(process.cwd(), 'missing.png') },
    },
  });
  emit({ type: 'result', status: 'success', response: 'missing image' });
} else if (prompt.includes('CASE_IMAGE_SUCCESS')) {
  const imagePath = join(process.cwd(), 'generated.png');
  writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  emit({
    type: 'step_update',
    step: {
      id: 'image-1',
      type: 'tool',
      tool_name: 'generate_image',
      status: 'completed',
      arguments: { Prompt: 'redacted', ImageName: 'generated' },
      result: { path: imagePath },
    },
  });
  emit({ type: 'result', status: 'success', response: 'generated image' });
} else {
  emit({ type: 'result', status: 'success', response: 'ok', usage: { output_tokens: 1 } });
}
