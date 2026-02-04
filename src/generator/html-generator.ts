/**
 * HTMLGenerator - HTML 生成模块
 *
 * 负责生成基础卡片的 HTML 文件和主入口页面
 */

import type {
  CardData,
  BaseCardConfig,
  RendererCode,
  RendererCodeMap,
  HTMLFileMap,
} from '../types';

/**
 * HTMLGenerator 配置选项
 */
export interface HTMLGeneratorOptions {
  /** 是否压缩 HTML */
  minify?: boolean;
  /** 是否内联样式 */
  inlineStyles?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: HTMLGeneratorOptions = {
  minify: false,
  inlineStyles: false,
};

/**
 * HTML 生成结果
 */
export interface GenerateResult {
  /** 是否成功 */
  success: boolean;
  /** HTML 文件映射 */
  files?: HTMLFileMap;
  /** 错误信息 */
  error?: string;
  /** 警告列表 */
  warnings?: string[];
}

/**
 * HTML 生成器
 */
export class HTMLGenerator {
  private _options: HTMLGeneratorOptions;

  /**
   * 创建 HTML 生成器实例
   *
   * @param options - 配置选项
   */
  constructor(options?: HTMLGeneratorOptions) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 生成所有 HTML 文件
   *
   * @param cardData - 卡片数据
   * @param renderers - 渲染代码映射
   * @returns 生成结果
   */
  async generate(cardData: CardData, renderers: RendererCodeMap): Promise<GenerateResult> {
    const files: HTMLFileMap = new Map();
    const warnings: string[] = [];

    try {
      // 1. 为每个基础卡片生成 HTML
      for (const baseCard of cardData.baseCards) {
        const renderer = renderers.get(baseCard.type);
        if (!renderer) {
          warnings.push(`未找到渲染器: ${baseCard.type}`);
          continue;
        }

        const html = this._generateBaseCardHTML(baseCard, renderer);
        files.set(`cards/${baseCard.id}.html`, html);
      }

      // 2. 生成主入口页面
      const indexHTML = this._generateIndexHTML(cardData, cardData.baseCards.map(c => c.id));
      files.set('index.html', indexHTML);

      return {
        success: true,
        files,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '生成失败',
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  }

  /**
   * 生成单个基础卡片的 HTML
   *
   * @param baseCard - 基础卡片配置
   * @param renderer - 渲染代码
   * @returns HTML 字符串
   */
  private _generateBaseCardHTML(baseCard: BaseCardConfig, renderer: RendererCode): string {
    // 在渲染代码中注入卡片配置
    const configScript = this._createConfigScript(baseCard.config);

    // 查找插入点（在 </head> 之前或 <body> 开始处）
    let html = renderer.html;

    // 注入配置脚本
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${configScript}\n</head>`);
    } else if (html.includes('<body>')) {
      html = html.replace('<body>', `<body>\n${configScript}`);
    } else {
      html = configScript + html;
    }

    // 如果需要内联样式
    if (this._options.inlineStyles && renderer.css) {
      const styleTag = `<style>\n${renderer.css}\n</style>`;
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${styleTag}\n</head>`);
      }
    }

    // 如果需要压缩
    if (this._options.minify) {
      html = this._minifyHTML(html);
    }

    return html;
  }

  /**
   * 生成主入口页面
   *
   * @param cardData - 卡片数据
   * @param baseCardIds - 基础卡片 ID 列表
   * @returns HTML 字符串
   */
  private _generateIndexHTML(cardData: CardData, _baseCardIds: string[]): string {
    const { metadata } = cardData;
    const tags = (metadata.tags ?? []) as unknown[];
    const createdAt = metadata.createdAt
      ? new Date(metadata.createdAt).toLocaleString('zh-CN')
      : '未知';
    const exportAt = new Date().toLocaleString('zh-CN');
    const baseCards = cardData.baseCards ?? [];

    const baseCardContent = baseCards.length > 0
      ? baseCards.map((baseCard) => {
        const typeLabel = this._getBaseCardTypeName(baseCard.type);
        const contentHTML = this._renderBaseCardContent(baseCard);
        return `
        <div class="base-card">
          <span class="base-card-type">${this._escapeHTML(typeLabel)}</span>
          <div class="base-card-content">${contentHTML}</div>
        </div>`;
      }).join('')
      : '<p class="empty-state">此卡片暂无内容</p>';

    const tagHTML = tags.length > 0
      ? `
    <div class="tags">
      ${tags.map((tag) => {
        const label = Array.isArray(tag) ? tag.join('/') : String(tag ?? '');
        return `<span class="tag">${this._escapeHTML(label)}</span>`;
      }).join('')}
    </div>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="Chips CardtoHTML Plugin">
  <meta name="created-at" content="${this._escapeHTML(metadata.createdAt)}">
  <meta name="modified-at" content="${this._escapeHTML(metadata.modifiedAt)}">
  <title>${this._escapeHTML(metadata.name)}</title>
  <link rel="stylesheet" href="theme.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      line-height: 1.8;
      color: #333;
      background: #f5f5f5;
      padding: 40px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      padding: 48px;
    }
    h1 {
      color: #1a1a1a;
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 16px;
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 16px;
    }
    .meta {
      color: #666;
      font-size: 14px;
      margin-bottom: 32px;
      padding: 16px;
      background: #f8fafc;
      border-radius: 8px;
    }
    .meta p { margin: 6px 0; }
    .meta strong { color: #333; }
    .content { margin-top: 24px; }
    .content h2 {
      font-size: 20px;
      color: #1a1a1a;
      margin: 24px 0 16px;
      padding-left: 12px;
      border-left: 4px solid #3b82f6;
    }
    .base-card {
      background: #fafafa;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin: 12px 0;
    }
    .base-card-type {
      display: inline-block;
      background: #e0f2fe;
      color: #0369a1;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 8px;
    }
    .base-card-content {
      color: #374151;
      font-size: 15px;
    }
    .base-card-content img {
      max-width: 100%;
      height: auto;
    }
    .empty-state {
      color: #999;
      text-align: center;
      padding: 40px 0;
    }
    .tags {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
    }
    .tag {
      display: inline-block;
      background: #dbeafe;
      color: #1d4ed8;
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 13px;
      margin: 4px 4px 4px 0;
    }
    .footer {
      margin-top: 40px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      color: #9ca3af;
      font-size: 12px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${this._escapeHTML(metadata.name)}</h1>
    <div class="meta">
      <p><strong>卡片 ID:</strong> ${this._escapeHTML(metadata.id)}</p>
      <p><strong>创建时间:</strong> ${this._escapeHTML(createdAt)}</p>
      <p><strong>导出时间:</strong> ${this._escapeHTML(exportAt)}</p>
    </div>
    <div class="content">
      <h2>卡片内容</h2>
      ${baseCardContent}
    </div>
    ${tagHTML}
    <div class="footer">
      由 Chips Editor 导出 · ${new Date().toLocaleDateString('zh-CN')}
    </div>
  </div>
</body>
</html>`;

    return this._options.minify ? this._minifyHTML(html) : html;
  }

  /**
   * 获取基础卡片类型名称
   */
  private _getBaseCardTypeName(type: string): string {
    const typeNames: Record<string, string> = {
      'rich-text': '富文本',
      'markdown': 'Markdown',
      'image': '图片',
      'video': '视频',
      'audio': '音频',
      'code': '代码',
      'list': '列表',
    };
    return typeNames[type] || type;
  }

  /**
   * 渲染基础卡片内容
   */
  private _renderBaseCardContent(baseCard: BaseCardConfig): string {
    const config = baseCard.config ?? {};
    const content = (config as Record<string, unknown>).content_text
      ?? (config as Record<string, unknown>).content
      ?? (config as Record<string, unknown>).text
      ?? '';

    if (typeof content === 'string' && content.trim().length > 0) {
      return content;
    }

    return '<em style="color:#999">暂无内容</em>';
  }

  /**
   * 创建配置注入脚本
   *
   * @param config - 配置对象
   * @returns script 标签
   */
  private _createConfigScript(config: Record<string, unknown>): string {
    const configJSON = JSON.stringify(config, null, 2);
    return `<script>
  window.CHIPS_CARD_CONFIG = ${configJSON};
</script>`;
  }

  /**
   * HTML 转义
   */
  private _escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 简易 HTML 压缩
   */
  private _minifyHTML(html: string): string {
    return html
      .replace(/\n\s*\n/g, '\n')
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}

/**
 * 创建生成器实例
 */
export function createHTMLGenerator(options?: HTMLGeneratorOptions): HTMLGenerator {
  return new HTMLGenerator(options);
}

/**
 * 默认生成器实例
 */
export const htmlGenerator = createHTMLGenerator();
