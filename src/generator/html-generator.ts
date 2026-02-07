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
import type { ConversionAppearanceProfile } from '../appearance';
import { resolveConversionAppearance } from '../appearance';

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
 * 直出 DOM 渲染模型（用于 index.html）
 */
interface InlineCardBundle {
  id: string;
  type: string;
  typeLabel: string;
  config: Record<string, unknown>;
  bodyHTML: string;
  inlineStyles: string[];
  externalStyles: string[];
  externalScripts: string[];
  inlineScripts: string[];
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
  async generate(
    cardData: CardData,
    renderers: RendererCodeMap,
    appearance?: ConversionAppearanceProfile
  ): Promise<GenerateResult> {
    const files: HTMLFileMap = new Map();
    const warnings: string[] = [];
    const inlineCardBundles: InlineCardBundle[] = [];
    const resolvedAppearance = appearance ?? resolveConversionAppearance();

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
        inlineCardBundles.push(this._buildInlineCardBundle(baseCard, html));
      }

      // 2. 生成主入口页面
      const indexHTML = this._generateIndexHTML(cardData, inlineCardBundles, resolvedAppearance);
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
   * 采用「无 iframe 纯直出 DOM」架构：
   * - 所有基础卡片内容直接挂载到 index.html
   * - 每个基础卡片使用 Shadow DOM 作为样式/脚本隔离容器
   * - 导出页面在 file:// 场景下可独立打开，无需薯片运行时环境
   *
   * @param cardData - 卡片数据
   * @param inlineCardBundles - 基础卡片直出数据
   * @param appearance - 统一外观配置
   * @returns HTML 字符串
   */
  private _generateIndexHTML(
    cardData: CardData,
    inlineCardBundles: InlineCardBundle[],
    appearance: ConversionAppearanceProfile
  ): string {
    const { metadata } = cardData;
    const { layout } = appearance;
    const tags = (metadata.tags ?? []) as unknown[];
    const bundleJSON = this._serializeForInlineScript(inlineCardBundles);

    // 为每个基础卡片生成挂载容器
    const cardContent = inlineCardBundles.length > 0
      ? inlineCardBundles.map((bundle) => {
        return `
        <section class="base-card-wrapper" data-card-id="${this._escapeHTML(bundle.id)}" data-card-type="${this._escapeHTML(bundle.type)}" aria-label="${this._escapeHTML(bundle.typeLabel)}">
          <div class="base-card-host"></div>
        </section>`;
      }).join('\n')
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
  <title>${this._escapeHTML(metadata.name)}</title>
  <link rel="stylesheet" href="theme.css">
  <style>
    :root {
      --chips-page-bg: ${this._escapeHTML(layout.pageBackgroundColor)};
      --chips-card-width: ${layout.cardWidthPx}px;
      --chips-page-padding-x: ${layout.pagePaddingXpx}px;
      --chips-page-padding-y: ${layout.pagePaddingYpx}px;
      --chips-page-padding-bottom-extra: ${layout.pagePaddingBottomExtraPx}px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      line-height: 1.8;
      color: #333;
      background: var(--chips-page-bg);
      padding: var(--chips-page-padding-y) var(--chips-page-padding-x) calc(var(--chips-page-padding-y) + var(--chips-page-padding-bottom-extra));
    }
    .card-container {
      width: 100%;
      max-width: var(--chips-card-width);
      margin: 0 auto;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .card-header {
      padding: 32px 48px 24px;
      border-bottom: 1px solid #e5e7eb;
    }
    .card-header h1 {
      color: #1a1a1a;
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 0;
    }
    .card-body {
      display: flex;
      flex-direction: column;
    }
    .base-card-wrapper {
      width: 100%;
      position: relative;
      overflow: visible;
      border-bottom: 1px solid #f0f2f5;
      padding: 20px 24px;
    }
    .base-card-wrapper:last-child {
      border-bottom: none;
    }
    .base-card-host {
      width: 100%;
      display: block;
      min-height: 48px;
      background: transparent;
    }
    .empty-state {
      color: #999;
      text-align: center;
      padding: 60px 0;
      font-size: 15px;
    }
    .tags {
      padding: 16px 48px 24px;
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
    @media (max-width: 768px) {
      :root {
        --chips-page-padding-x: ${layout.mobilePaddingXpx}px;
        --chips-page-padding-y: ${layout.mobilePaddingYpx}px;
      }
      .card-header {
        padding: 22px 20px 16px;
      }
      .base-card-wrapper {
        padding: 14px 12px;
      }
      .tags {
        padding: 12px 20px 14px;
      }
    }
    @media print {
      html, body {
        background: var(--chips-page-bg) !important;
      }
      * {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="card-container">
    <div class="card-header">
      <h1>${this._escapeHTML(metadata.name)}</h1>
    </div>
    <div class="card-body">
      ${cardContent}
    </div>
    ${tagHTML}
  </div>

  <script>
    (function() {
      var bundles = ${bundleJSON};

      function createScopedDocument(scopeRoot) {
        var owner = scopeRoot.ownerDocument || document;

        function findById(id) {
          if (!id) return null;
          var list = scopeRoot.querySelectorAll('[id]');
          for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) {
              return list[i];
            }
          }
          return null;
        }

        return {
          getElementById: findById,
          querySelector: function(selector) {
            return scopeRoot.querySelector(selector);
          },
          querySelectorAll: function(selector) {
            return scopeRoot.querySelectorAll(selector);
          },
          getElementsByClassName: function(className) {
            return scopeRoot.getElementsByClassName(className);
          },
          getElementsByTagName: function(tagName) {
            return scopeRoot.getElementsByTagName(tagName);
          },
          createElement: function(tagName) {
            return owner.createElement(tagName);
          },
          createElementNS: function(namespaceURI, qualifiedName) {
            return owner.createElementNS(namespaceURI, qualifiedName);
          },
          createTextNode: function(text) {
            return owner.createTextNode(text);
          },
          createDocumentFragment: function() {
            return owner.createDocumentFragment();
          },
          addEventListener: function(type, listener, options) {
            scopeRoot.addEventListener(type, listener, options);
          },
          removeEventListener: function(type, listener, options) {
            scopeRoot.removeEventListener(type, listener, options);
          },
          body: scopeRoot,
          head: scopeRoot,
          documentElement: scopeRoot,
          defaultView: window,
          readyState: 'complete',
        };
      }

      function runInlineScript(sourceCode, scopedWindow, scopedDocument, cardId) {
        if (!sourceCode || !sourceCode.trim()) return;
        try {
          var runner = new Function('window', 'document', sourceCode + '\\n//# sourceURL=chips-inline-card-' + String(cardId || 'unknown'));
          runner.call(scopedWindow, scopedWindow, scopedDocument);
        } catch (e) {
          console.error('[Chips Export] 基础卡片脚本执行失败:', cardId, e);
        }
      }

      function mountBundle(wrapper, bundle) {
        var host = wrapper.querySelector('.base-card-host');
        if (!host || !bundle) return;

        var owner = host.ownerDocument || document;
        var mountRoot = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

        if (mountRoot.innerHTML !== undefined) {
          mountRoot.innerHTML = '';
        }

        if (host.attachShadow) {
          var resetStyle = owner.createElement('style');
          resetStyle.textContent = ':host{display:block;width:100%;contain:content;} .chips-inline-card-shell{width:100%;display:block;}';
          mountRoot.appendChild(resetStyle);
        }

        if (Array.isArray(bundle.externalStyles)) {
          for (var i = 0; i < bundle.externalStyles.length; i++) {
            var href = bundle.externalStyles[i];
            if (!href) continue;
            var linkEl = owner.createElement('link');
            linkEl.rel = 'stylesheet';
            linkEl.href = href;
            mountRoot.appendChild(linkEl);
          }
        }

        if (Array.isArray(bundle.inlineStyles)) {
          for (var j = 0; j < bundle.inlineStyles.length; j++) {
            var cssText = bundle.inlineStyles[j];
            if (!cssText) continue;
            var styleEl = owner.createElement('style');
            styleEl.textContent = cssText;
            mountRoot.appendChild(styleEl);
          }
        }

        var scopeRoot = owner.createElement('div');
        scopeRoot.className = 'chips-inline-card-shell';
        scopeRoot.innerHTML = bundle.bodyHTML || '';
        mountRoot.appendChild(scopeRoot);

        var scopedDocument = createScopedDocument(scopeRoot);
        var scopedWindow = {
          CHIPS_CARD_CONFIG: bundle.config || {},
          document: scopedDocument,
          console: window.console,
          setTimeout: window.setTimeout.bind(window),
          clearTimeout: window.clearTimeout.bind(window),
          requestAnimationFrame: window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null,
          cancelAnimationFrame: window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : null,
        };
        scopedWindow.window = scopedWindow;
        scopedWindow.self = scopedWindow;
        scopedWindow.globalThis = scopedWindow;

        function executeInlineScripts() {
          var scripts = Array.isArray(bundle.inlineScripts) ? bundle.inlineScripts : [];
          for (var k = 0; k < scripts.length; k++) {
            runInlineScript(scripts[k], scopedWindow, scopedDocument, bundle.id);
          }
        }

        function loadExternalScriptsSequentially(sources, done, index) {
          if (index >= sources.length) {
            done();
            return;
          }

          var src = sources[index];
          if (!src) {
            loadExternalScriptsSequentially(sources, done, index + 1);
            return;
          }

          var scriptEl = owner.createElement('script');
          scriptEl.src = src;
          scriptEl.async = false;
          scriptEl.onload = function() {
            loadExternalScriptsSequentially(sources, done, index + 1);
          };
          scriptEl.onerror = function() {
            console.error('[Chips Export] 外链脚本加载失败:', src);
            loadExternalScriptsSequentially(sources, done, index + 1);
          };
          owner.head.appendChild(scriptEl);
        }

        var externalScripts = Array.isArray(bundle.externalScripts) ? bundle.externalScripts : [];
        if (externalScripts.length > 0) {
          loadExternalScriptsSequentially(externalScripts, executeInlineScripts, 0);
        } else {
          executeInlineScripts();
        }
      }

      var wrappers = document.querySelectorAll('.base-card-wrapper');
      for (var idx = 0; idx < wrappers.length; idx++) {
        mountBundle(wrappers[idx], bundles[idx]);
      }
    })();
  </script>
</body>
</html>`;

    return this._options.minify ? this._minifyHTML(html) : html;
  }

  /**
   * 获取基础卡片类型的中文名称
   *
   * 类型名统一使用 PascalCase（卡片文件格式规范标准）
   */
  private _getBaseCardTypeName(type: string): string {
    const typeNames: Record<string, string> = {
      'RichTextCard': '富文本',
      'MarkdownCard': 'Markdown',
      'ImageCard': '图片',
      'VideoCard': '视频',
      'AudioCard': '音频',
      'CodeBlockCard': '代码',
      'ListCard': '列表',
    };
    return typeNames[type] || type;
  }

  /**
   * 构建基础卡片直出 DOM 数据
   */
  private _buildInlineCardBundle(baseCard: BaseCardConfig, cardHTML: string): InlineCardBundle {
    const inlineStyles = this._extractInlineStyleBlocks(cardHTML).map((css) => this._scopeCardStyle(css));
    const externalStyles = Array.from(new Set(
      this._extractExternalStyles(cardHTML)
        .map((href) => this._normalizeRelativePath(href))
        .filter((href) => href.length > 0 && !this._isThemeStylesheet(href))
    ));
    const externalScripts = Array.from(new Set(
      this._extractExternalScripts(cardHTML)
        .map((src) => this._normalizeRelativePath(src))
        .filter((src) => src.length > 0)
    ));
    const inlineScripts = this._extractInlineScripts(cardHTML).filter((code) => !this._isConfigScript(code));
    const bodyHTML = this._stripScriptTags(this._extractBodyHTML(cardHTML));

    return {
      id: baseCard.id,
      type: baseCard.type,
      typeLabel: this._getBaseCardTypeName(baseCard.type),
      config: baseCard.config ?? {},
      bodyHTML,
      inlineStyles,
      externalStyles,
      externalScripts,
      inlineScripts,
    };
  }

  /**
   * 提取 <body> 内部 HTML
   */
  private _extractBodyHTML(html: string): string {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch?.[1] ?? html;
  }

  /**
   * 提取内联样式块
   */
  private _extractInlineStyleBlocks(html: string): string[] {
    const styles: string[] = [];
    const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

    let match = styleRegex.exec(html);
    while (match) {
      styles.push(match[1] ?? '');
      match = styleRegex.exec(html);
    }

    return styles;
  }

  /**
   * 提取外部样式链接（link rel="stylesheet"）
   */
  private _extractExternalStyles(html: string): string[] {
    const links: string[] = [];
    const linkRegex = /<link\b([^>]+)>/gi;

    let match = linkRegex.exec(html);
    while (match) {
      const attrs = match[1] ?? '';
      if (!/rel\s*=\s*["']?stylesheet["']?/i.test(attrs)) {
        match = linkRegex.exec(html);
        continue;
      }

      let hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!hrefMatch) {
        hrefMatch = attrs.match(/href\s*=\s*([^\s"'=<>`]+)/i);
      }

      if (hrefMatch?.[1]) {
        links.push(hrefMatch[1]);
      }

      match = linkRegex.exec(html);
    }

    return links;
  }

  /**
   * 提取外链脚本（script src="..."）
   */
  private _extractExternalScripts(html: string): string[] {
    const scripts: string[] = [];
    const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

    let match = scriptRegex.exec(html);
    while (match) {
      const attrs = match[1] ?? '';
      let srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
      if (!srcMatch) {
        srcMatch = attrs.match(/src\s*=\s*([^\s"'=<>`]+)/i);
      }

      if (srcMatch?.[1]) {
        scripts.push(srcMatch[1]);
      }

      match = scriptRegex.exec(html);
    }

    return scripts;
  }

  /**
   * 提取内联脚本（不包含 src 外链脚本）
   */
  private _extractInlineScripts(html: string): string[] {
    const scripts: string[] = [];
    const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

    let match = scriptRegex.exec(html);
    while (match) {
      const attrs = match[1] ?? '';
      if (/src\s*=/i.test(attrs)) {
        match = scriptRegex.exec(html);
        continue;
      }

      const code = match[2] ?? '';
      if (code.trim().length > 0) {
        scripts.push(code);
      }

      match = scriptRegex.exec(html);
    }

    return scripts;
  }

  /**
   * 删除 HTML 中的脚本标签，避免重复执行
   */
  private _stripScriptTags(html: string): string {
    return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  }

  /**
   * 判断脚本是否为配置注入脚本
   */
  private _isConfigScript(code: string): boolean {
    return /window\.CHIPS_CARD_CONFIG\s*=/.test(code);
  }

  /**
   * 判断是否为主题样式文件
   */
  private _isThemeStylesheet(href: string): boolean {
    const normalized = href.replace(/^[./]+/, '');
    return normalized === 'theme.css' || normalized.endsWith('/theme.css');
  }

  /**
   * 将相对路径归一到 index.html 相对路径
   */
  private _normalizeRelativePath(path: string): string {
    let normalized = path.trim();
    while (normalized.startsWith('../')) {
      normalized = normalized.slice(3);
    }
    if (normalized.startsWith('./')) {
      normalized = normalized.slice(2);
    }
    return normalized;
  }

  /**
   * 将基础卡片样式从页面级选择器转换为 Shadow DOM 作用域
   */
  private _scopeCardStyle(css: string): string {
    return css
      .replace(/:root/g, ':host')
      .replace(/\bhtml\b/g, ':host')
      .replace(/\bbody\b/g, ':host');
  }

  /**
   * 将数据序列化为可安全内联到 <script> 的 JSON
   */
  private _serializeForInlineScript(value: unknown): string {
    const json = JSON.stringify(value) ?? 'null';
    return json
      .replace(/</g, '\\u003C')
      .replace(/>/g, '\\u003E')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
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
