/**
 * RendererFetcher - 渲染代码获取模块
 *
 * 负责从基础卡片插件获取各类型卡片的前端渲染代码
 */

import type { RendererCode, RendererCodeMap } from '../types';

/**
 * RendererFetcher 配置选项
 */
export interface RendererFetcherOptions {
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 缓存过期时间（毫秒） */
  cacheExpiry?: number;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: RendererFetcherOptions = {
  enableCache: true,
  cacheExpiry: 3600000, // 1 小时
};

/**
 * 占位渲染器 HTML 模板
 */
const PLACEHOLDER_HTML = (cardType: string): string => `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>未知卡片类型</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .placeholder {
      text-align: center;
      color: #666;
    }
    .placeholder-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .placeholder-type {
      font-size: 14px;
      color: #999;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="placeholder">
    <div class="placeholder-icon">📄</div>
    <div>未找到渲染插件</div>
    <div class="placeholder-type">卡片类型: ${cardType}</div>
  </div>
</body>
</html>
`;

/**
 * 缓存条目
 */
interface CacheEntry {
  code: RendererCode;
  timestamp: number;
}

/**
 * 渲染代码获取器
 */
export class RendererFetcher {
  private _options: RendererFetcherOptions;
  private _cache: Map<string, CacheEntry> = new Map();

  /**
   * 创建渲染代码获取器实例
   *
   * @param options - 配置选项
   */
  constructor(options?: RendererFetcherOptions) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 批量获取渲染代码
   *
   * @param cardTypes - 卡片类型列表
   * @returns 渲染代码映射
   */
  async fetchRenderers(cardTypes: string[]): Promise<RendererCodeMap> {
    const result: RendererCodeMap = new Map();
    const uniqueTypes = [...new Set(cardTypes)];

    for (const cardType of uniqueTypes) {
      const renderer = await this.fetchRenderer(cardType);
      result.set(cardType, renderer);
    }

    return result;
  }

  /**
   * 获取单个类型的渲染代码
   *
   * @param cardType - 卡片类型
   * @returns 渲染代码
   */
  async fetchRenderer(cardType: string): Promise<RendererCode> {
    // 检查缓存
    if (this._options.enableCache) {
      const cached = this._getFromCache(cardType);
      if (cached) {
        return cached;
      }
    }

    // 尝试从插件系统获取
    const renderer = await this._fetchFromPluginSystem(cardType);

    // 存入缓存
    if (this._options.enableCache && renderer) {
      this._setToCache(cardType, renderer);
    }

    return renderer;
  }

  /**
   * 获取占位渲染器
   *
   * @param cardType - 卡片类型
   * @returns 占位渲染代码
   */
  getPlaceholderRenderer(cardType: string): RendererCode {
    return {
      html: PLACEHOLDER_HTML(cardType),
      css: '',
    };
  }

  /**
   * 清除缓存
   *
   * @param cardType - 指定类型（不传则清除全部）
   */
  clearCache(cardType?: string): void {
    if (cardType) {
      this._cache.delete(cardType);
    } else {
      this._cache.clear();
    }
  }

  /**
   * 从缓存获取
   */
  private _getFromCache(cardType: string): RendererCode | null {
    const entry = this._cache.get(cardType);
    if (!entry) return null;

    // 检查是否过期
    const now = Date.now();
    if (now - entry.timestamp > (this._options.cacheExpiry ?? DEFAULT_OPTIONS.cacheExpiry!)) {
      this._cache.delete(cardType);
      return null;
    }

    return entry.code;
  }

  /**
   * 存入缓存
   */
  private _setToCache(cardType: string, code: RendererCode): void {
    this._cache.set(cardType, {
      code,
      timestamp: Date.now(),
    });
  }

  /**
   * 从插件系统获取渲染代码
   *
   * @param cardType - 卡片类型
   * @returns 渲染代码或占位渲染器
   */
  private async _fetchFromPluginSystem(cardType: string): Promise<RendererCode> {
    // TODO: 通过 SDK 的 PluginManager 获取插件的渲染代码
    // 目前返回内置的渲染器或占位渲染器

    // 内置基础类型的简易渲染器
    const builtinRenderers: Record<string, RendererCode> = {
      'rich-text': this._createRichTextRenderer(),
      'image': this._createImageRenderer(),
      'video': this._createVideoRenderer(),
      'audio': this._createAudioRenderer(),
      'code': this._createCodeRenderer(),
      'markdown': this._createMarkdownRenderer(),
    };

    const builtin = builtinRenderers[cardType];
    if (builtin) {
      return builtin;
    }

    // 返回占位渲染器
    return this.getPlaceholderRenderer(cardType);
  }

  /**
   * 创建富文本渲染器
   */
  private _createRichTextRenderer(): RendererCode {
    return {
      html: `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>富文本卡片</title>
  <link rel="stylesheet" href="../theme.css">
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: var(--font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--font-size-base, 16px);
      line-height: var(--line-height-base, 1.6);
      color: var(--text-color, #333);
      background: var(--bg-color, #fff);
    }
    .rich-text-content {
      max-width: 100%;
    }
    .rich-text-content img {
      max-width: 100%;
      height: auto;
    }
    .rich-text-content a {
      color: var(--link-color, #0066cc);
    }
  </style>
</head>
<body>
  <div class="rich-text-content" id="content"></div>
  <script>
    (function() {
      var config = window.CHIPS_CARD_CONFIG || {};
      var content = config.content_text || config.content || '';
      document.getElementById('content').innerHTML = content;
    })();
  </script>
</body>
</html>
`,
      css: '',
    };
  }

  /**
   * 创建图片渲染器
   */
  private _createImageRenderer(): RendererCode {
    return {
      html: `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>图片卡片</title>
  <link rel="stylesheet" href="../theme.css">
  <style>
    body {
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      background: var(--bg-color, #f5f5f5);
    }
    .image-container {
      max-width: 100%;
      text-align: center;
    }
    .image-container img {
      max-width: 100%;
      height: auto;
      display: block;
    }
    .image-caption {
      padding: 8px 16px;
      font-size: 14px;
      color: var(--text-secondary, #666);
      background: var(--bg-secondary, #f9f9f9);
    }
  </style>
</head>
<body>
  <div class="image-container">
    <img id="image" src="" alt="">
    <div class="image-caption" id="caption"></div>
  </div>
  <script>
    (function() {
      var config = window.CHIPS_CARD_CONFIG || {};
      var img = document.getElementById('image');
      var caption = document.getElementById('caption');
      img.src = config.src || config.url || '';
      img.alt = config.alt || config.title || '';
      caption.textContent = config.caption || config.description || '';
      if (!caption.textContent) caption.style.display = 'none';
    })();
  </script>
</body>
</html>
`,
      css: '',
    };
  }

  /**
   * 创建视频渲染器
   */
  private _createVideoRenderer(): RendererCode {
    return {
      html: `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>视频卡片</title>
  <link rel="stylesheet" href="../theme.css">
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #000;
    }
    .video-container {
      width: 100%;
      height: 100%;
    }
    video {
      width: 100%;
      height: auto;
      display: block;
    }
  </style>
</head>
<body>
  <div class="video-container">
    <video id="video" controls>
      您的浏览器不支持视频播放
    </video>
  </div>
  <script>
    (function() {
      var config = window.CHIPS_CARD_CONFIG || {};
      var video = document.getElementById('video');
      video.src = config.src || config.url || '';
      if (config.poster) video.poster = config.poster;
      if (config.autoplay) video.autoplay = true;
      if (config.loop) video.loop = true;
      if (config.muted) video.muted = true;
    })();
  </script>
</body>
</html>
`,
      css: '',
    };
  }

  /**
   * 创建音频渲染器
   */
  private _createAudioRenderer(): RendererCode {
    return {
      html: `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>音频卡片</title>
  <link rel="stylesheet" href="../theme.css">
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: var(--bg-color, #f5f5f5);
    }
    .audio-container {
      background: var(--bg-secondary, #fff);
      border-radius: 8px;
      padding: 16px;
    }
    .audio-title {
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 12px;
      color: var(--text-color, #333);
    }
    audio {
      width: 100%;
    }
  </style>
</head>
<body>
  <div class="audio-container">
    <div class="audio-title" id="title"></div>
    <audio id="audio" controls>
      您的浏览器不支持音频播放
    </audio>
  </div>
  <script>
    (function() {
      var config = window.CHIPS_CARD_CONFIG || {};
      var audio = document.getElementById('audio');
      var title = document.getElementById('title');
      audio.src = config.src || config.url || '';
      title.textContent = config.title || config.name || '音频';
    })();
  </script>
</body>
</html>
`,
      css: '',
    };
  }

  /**
   * 创建代码渲染器
   */
  private _createCodeRenderer(): RendererCode {
    return {
      html: `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>代码卡片</title>
  <link rel="stylesheet" href="../theme.css">
  <style>
    body {
      margin: 0;
      padding: 0;
      background: var(--code-bg, #1e1e1e);
    }
    .code-container {
      font-family: var(--font-mono, 'Consolas', 'Monaco', monospace);
      font-size: 14px;
      line-height: 1.5;
    }
    .code-header {
      padding: 8px 16px;
      background: var(--code-header-bg, #2d2d2d);
      color: var(--code-header-color, #ccc);
      font-size: 12px;
    }
    pre {
      margin: 0;
      padding: 16px;
      overflow-x: auto;
      color: var(--code-color, #d4d4d4);
    }
    code {
      font-family: inherit;
    }
  </style>
</head>
<body>
  <div class="code-container">
    <div class="code-header" id="language"></div>
    <pre><code id="code"></code></pre>
  </div>
  <script>
    (function() {
      var config = window.CHIPS_CARD_CONFIG || {};
      var codeEl = document.getElementById('code');
      var langEl = document.getElementById('language');
      codeEl.textContent = config.code || config.content || '';
      langEl.textContent = config.language || 'plaintext';
    })();
  </script>
</body>
</html>
`,
      css: '',
    };
  }

  /**
   * 创建 Markdown 渲染器
   */
  private _createMarkdownRenderer(): RendererCode {
    return {
      html: `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown 卡片</title>
  <link rel="stylesheet" href="../theme.css">
  <style>
    body {
      margin: 0;
      padding: 16px 24px;
      font-family: var(--font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--font-size-base, 16px);
      line-height: var(--line-height-base, 1.6);
      color: var(--text-color, #333);
      background: var(--bg-color, #fff);
    }
    .markdown-content h1, .markdown-content h2, .markdown-content h3 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    .markdown-content p { margin: 1em 0; }
    .markdown-content code {
      background: var(--code-inline-bg, #f5f5f5);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--font-mono, monospace);
    }
    .markdown-content pre {
      background: var(--code-bg, #1e1e1e);
      color: var(--code-color, #d4d4d4);
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
    }
    .markdown-content pre code {
      background: transparent;
      padding: 0;
    }
    .markdown-content blockquote {
      margin: 1em 0;
      padding: 0.5em 1em;
      border-left: 4px solid var(--border-color, #ddd);
      background: var(--bg-secondary, #f9f9f9);
    }
  </style>
</head>
<body>
  <div class="markdown-content" id="content"></div>
  <script>
    (function() {
      var config = window.CHIPS_CARD_CONFIG || {};
      var content = config.content || config.markdown || '';
      // 简易 Markdown 转换（实际应使用专业库）
      var html = content
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
        .replace(/\`(.+?)\`/g, '<code>$1</code>')
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        .replace(/\\n/g, '<br>');
      document.getElementById('content').innerHTML = html;
    })();
  </script>
</body>
</html>
`,
      css: '',
    };
  }
}

/**
 * 创建获取器实例
 */
export function createRendererFetcher(options?: RendererFetcherOptions): RendererFetcher {
  return new RendererFetcher(options);
}

/**
 * 默认获取器实例
 */
export const rendererFetcher = createRendererFetcher();
