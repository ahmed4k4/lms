import { describe, it, expect } from 'vitest';
import { RESOURCE_TYPES, VIDEO_TYPES, resourceKey, sanitizeFilename, sniffMatchesType, sniffVideo, videoKey } from '@/lib/media-rules';

const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);

describe('video sniffing', () => {
  it('recognises mp4 and webm', () => {
    expect(sniffVideo(mp4)).toBe('mp4');
    expect(sniffVideo(webm)).toBe('webm');
  });
  it('rejects executables, html and truncated input', () => {
    expect(sniffVideo(new TextEncoder().encode('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffVideo(new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]))).toBeNull();
    expect(sniffVideo(new Uint8Array([1, 2]))).toBeNull();
  });
  it('requires the declared type to match the content', () => {
    expect(sniffMatchesType('mp4', 'video/mp4')).toBe(true);
    expect(sniffMatchesType('mp4', 'video/webm')).toBe(false);
    expect(sniffMatchesType('webm', 'video/webm')).toBe(true);
    expect(sniffMatchesType(null, 'video/mp4')).toBe(false);
  });
});

describe('object keys and filenames', () => {
  it('sanitizes traversal and odd characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('/');
    expect(sanitizeFilename('..\\..\\x.pdf')).not.toContain('\\');
    expect(sanitizeFilename('my file (1).pdf')).toBe('my-file-1.pdf');
    expect(sanitizeFilename('....')).toBe('file');
  });
  it('builds private, unguessable, scoped keys', () => {
    const k = videoKey('course-1', 'lesson-1', 'video/mp4');
    expect(k).toMatch(/^videos\/course-1\/lesson-1\/[0-9a-f-]{36}\.mp4$/);
    expect(videoKey('c', 'l', 'video/mp4')).not.toBe(videoKey('c', 'l', 'video/mp4'));
    expect(resourceKey('c', 'l', '../x.pdf')).toMatch(/^resources\/c\/l\/[0-9a-f-]{36}-x\.pdf$/);
    expect(() => videoKey('c', 'l', 'application/x-msdownload')).toThrow();
  });
  it('allow-lists only safe types (no html/svg/js/exe)', () => {
    for (const bad of ['text/html', 'image/svg+xml', 'application/javascript', 'application/x-msdownload']) {
      expect(RESOURCE_TYPES[bad]).toBeUndefined();
      expect(VIDEO_TYPES[bad]).toBeUndefined();
    }
  });
});
