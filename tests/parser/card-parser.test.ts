import { describe, expect, it } from 'vitest';
import { CardParser } from '../../src/parser/card-parser';

const encoder = new TextEncoder();

function toFileMap(files: Record<string, string>): Map<string, Uint8Array> {
  return new Map(
    Object.entries(files).map(([filePath, content]) => [filePath, encoder.encode(content)])
  );
}

describe('CardParser content schema', () => {
  it('parses standard base-card content format', async () => {
    const parser = new CardParser();
    const source = {
      type: 'files' as const,
      fileType: 'card' as const,
      files: toFileMap({
        '.card/metadata.yaml': [
          'card_id: "a1B2c3D4e5"',
          'name: "Test Card"',
          'created_at: "2026-01-01T00:00:00.000Z"',
          'modified_at: "2026-01-01T00:00:00.000Z"',
          'chips_standards_version: "1.0.0"',
        ].join('\n'),
        '.card/structure.yaml': [
          'structure:',
          '  - id: "n1B2c3D4e5"',
          '    type: "RichTextCard"',
          'manifest:',
          '  card_count: 1',
          '  resource_count: 0',
          '  resources: []',
        ].join('\n'),
        'content/n1B2c3D4e5.yaml': [
          'type: "RichTextCard"',
          'data:',
          '  content_text: "hello"',
        ].join('\n'),
      }),
    };

    const result = await parser.parse(source);

    expect(result.success).toBe(true);
    expect(result.data?.baseCards[0]?.type).toBe('RichTextCard');
    expect(result.data?.baseCards[0]?.config).toEqual({ content_text: 'hello' });
  });

  it('rejects non-standard base-card content format', async () => {
    const parser = new CardParser();
    const source = {
      type: 'files' as const,
      fileType: 'card' as const,
      files: toFileMap({
        '.card/metadata.yaml': [
          'card_id: "a1B2c3D4e5"',
          'name: "Test Card"',
          'created_at: "2026-01-01T00:00:00.000Z"',
          'modified_at: "2026-01-01T00:00:00.000Z"',
          'chips_standards_version: "1.0.0"',
        ].join('\n'),
        '.card/structure.yaml': [
          'structure:',
          '  - id: "n1B2c3D4e5"',
          '    type: "RichTextCard"',
          'manifest:',
          '  card_count: 1',
          '  resource_count: 0',
          '  resources: []',
        ].join('\n'),
        'content/n1B2c3D4e5.yaml': [
          'type: "RichTextCard"',
          'content_text: "legacy"',
        ].join('\n'),
      }),
    };

    const result = await parser.parse(source);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CONV-HTML-005');
  });
});
