import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasValidExamImagePayload } from '../server/examImageValidation.ts';

const examWithImages = (...images: string[]) => ({
  sections: [{ questions: images.map((imageDataUrl) => ({ imageDataUrl })) }],
});

test('accepts supported PNG, JPEG, and WEBP image data URLs', () => {
  assert.equal(hasValidExamImagePayload(examWithImages(
    'data:image/png;base64,AAAA',
    'data:image/jpeg;base64,AAAA',
    'data:image/webp;base64,AAAA'
  )), true);
});

test('allows exams without attached images', () => {
  assert.equal(hasValidExamImagePayload({ sections: [{ questions: [{ questionText: 'Q' }] }] }), true);
});

test('rejects unsupported SVG and non-data image URLs', () => {
  assert.equal(hasValidExamImagePayload(examWithImages('data:image/svg+xml;base64,AAAA')), false);
  assert.equal(hasValidExamImagePayload(examWithImages('https://example.com/image.png')), false);
});

test('rejects a single image exceeding the server limit', () => {
  assert.equal(hasValidExamImagePayload(examWithImages('data:image/jpeg;base64,' + 'A'.repeat(4_000_001))), false);
});

test('rejects aggregate image payloads exceeding 8.5 MB', () => {
  const image = 'data:image/jpeg;base64,' + 'A'.repeat(3_000_000);
  assert.equal(hasValidExamImagePayload(examWithImages(image, image, image)), false);
});

test('accepts aggregate image payloads within the configured limit', () => {
  const image = 'data:image/jpeg;base64,' + 'A'.repeat(2_500_000);
  assert.equal(hasValidExamImagePayload(examWithImages(image, image, image)), true);
});
