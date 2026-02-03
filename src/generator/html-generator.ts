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
  private _generateIndexHTML(cardData: CardData, baseCardIds: string[]): string {
    const { metadata, structure } = cardData;
    const layoutType = structure.layout?.type ?? 'vertical';

    // 生成 iframe 列表
    const iframes = baseCardIds.map(id => {
      const baseCard = cardData.baseCards.find(c => c.id === id);
      const title = baseCard?.name ?? id;
      return `    <iframe class="card-frame" src="cards/${id}.html" title="${this._escapeHTML(title)}"></iframe>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="Chips CardtoHTML Plugin">
  <meta name="created-at" content="${metadata.createdAt}">
  <meta name="modified-at" content="${metadata.modifiedAt}">
  <title>${this._escapeHTML(metadata.name)}</title>
  <link rel="stylesheet" href="theme.css">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: 100%;
      min-height: 100vh;
      background: var(--page-bg, #f5f5f5);
    }
    .card-container {
      max-width: var(--card-max-width, 800px);
      margin: 0 auto;
      padding: var(--card-padding, 24px);
      display: flex;
      flex-direction: ${layoutType === 'horizontal' ? 'row' : 'column'};
      gap: var(--card-gap, 16px);
    }
    .card-frame {
      width: 100%;
      border: none;
      background: var(--card-bg, #fff);
      border-radius: var(--card-radius, 8px);
      box-shadow: var(--card-shadow, 0 2px 8px rgba(0,0,0,0.1));
      min-height: 200px;
    }
    /* 响应式调整 */
    @media (max-width: 768px) {
      .card-container {
        padding: 16px;
        gap: 12px;
      }
    }
  </style>
</head>
<body>
  <main class="card-container">
${iframes}
  </main>
  <script>
    // 自动调整 iframe 高度
    (function() {
      var frames = document.querySelectorAll('.card-frame');
      frames.forEach(function(frame) {
        frame.addEventListener('load', function() {
          try {
            var doc = frame.contentDocument || frame.contentWindow.document;
            var height = doc.documentElement.scrollHeight || doc.body.scrollHeight;
            frame.style.height = height + 'px';
          } catch(e) {
            // 跨域时无法获取高度
          }
        });
      });
    })();
  </script>
</body>
</html>`;

    return this._options.minify ? this._minifyHTML(html) : html;
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
