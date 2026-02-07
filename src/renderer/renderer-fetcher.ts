/**
 * RendererFetcher - 渲染代码获取模块
 *
 * 负责获取各类型基础卡片的前端渲染代码（HTML/CSS）。
 *
 * 架构设计：
 * - 外部注册渲染器：通过 registerRenderer() 方法，PluginManager 或热安装的插件
 *   可以在运行时动态注册新的渲染代码。
 * - 内置后备渲染器：为常见基础卡片类型（RichTextCard、ImageCard 等）提供内置的
 *   简易渲染器，在插件尚未注册时作为后备。
 * - 占位渲染器：当以上两种方式都找不到时，返回占位页面。
 *
 * 查找优先级：外部注册 > 内置后备 > 占位渲染器
 *
 * 所有卡片类型名统一使用 PascalCase 格式（如 ImageCard、RichTextCard），
 * 与卡片文件格式规范、插件清单（manifest.yaml）、编辑器 store 保持一致。
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

  /** 外部注册的渲染器（来自 PluginManager 或热安装插件） */
  private _externalRenderers: Map<string, RendererCode> = new Map();

  /** 内置后备渲染器（PascalCase key，与卡片文件规范一致） */
  private _builtinRenderers: Record<string, () => RendererCode>;

  /**
   * 创建渲染代码获取器实例
   *
   * @param options - 配置选项
   */
  constructor(options?: RendererFetcherOptions) {
    this._options = { ...DEFAULT_OPTIONS, ...options };

    // 内置后备渲染器使用惰性创建，避免构造时的开销
    // key 统一使用 PascalCase，与卡片文件格式规范一致
    this._builtinRenderers = {
      'RichTextCard': () => this._createRichTextRenderer(),
      'ImageCard': () => this._createImageRenderer(),
      'VideoCard': () => this._createVideoRenderer(),
      'AudioCard': () => this._createAudioRenderer(),
      'CodeBlockCard': () => this._createCodeRenderer(),
      'MarkdownCard': () => this._createMarkdownRenderer(),
    };
  }

  /**
   * 注册外部渲染器
   *
   * 允许 PluginManager 或热安装的插件在运行时动态注册渲染代码。
   * 注册后的渲染器优先级高于内置后备渲染器。
   *
   * @param cardType - 卡片类型（PascalCase，如 'ImageCard'）
   * @param code - 渲染代码
   */
  registerRenderer(cardType: string, code: RendererCode): void {
    this._externalRenderers.set(cardType, code);
    // 清除该类型的缓存，确保下次获取时使用新注册的渲染器
    this.clearCache(cardType);
  }

  /**
   * 注销外部渲染器
   *
   * 插件卸载时调用，移除该类型的外部渲染器注册。
   *
   * @param cardType - 卡片类型
   */
  unregisterRenderer(cardType: string): void {
    this._externalRenderers.delete(cardType);
    this.clearCache(cardType);
  }

  /**
   * 获取所有已注册的渲染器类型（外部 + 内置）
   */
  getRegisteredTypes(): string[] {
    const types = new Set<string>();
    for (const type of this._externalRenderers.keys()) {
      types.add(type);
    }
    for (const type of Object.keys(this._builtinRenderers)) {
      types.add(type);
    }
    return Array.from(types);
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

    // 按优先级查找渲染器
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
   * 查找优先级：
   * 1. 外部注册的渲染器（来自 PluginManager 或热安装插件）
   * 2. 内置后备渲染器
   * 3. 占位渲染器
   *
   * @param cardType - 卡片类型（PascalCase，如 'ImageCard'）
   * @returns 渲染代码
   */
  private async _fetchFromPluginSystem(cardType: string): Promise<RendererCode> {
    // 1. 外部注册的渲染器（优先级最高）
    const external = this._externalRenderers.get(cardType);
    if (external) {
      return external;
    }

    // 2. 内置后备渲染器
    const builtinFactory = this._builtinRenderers[cardType];
    if (builtinFactory) {
      return builtinFactory();
    }

    // 3. 占位渲染器
    return this.getPlaceholderRenderer(cardType);
  }

  // ========== 内置后备渲染器 ==========
  // 以下渲染器为常见基础卡片类型提供简易的静态 HTML 渲染，
  // 在对应的基础卡片插件注册渲染代码之前作为后备使用。
  // 未来插件通过 registerRenderer() 注册后，将自动覆盖这些内置版本。

  /**
   * 创建富文本渲染器（RichTextCard）
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
      var content = config.content_text || config.content || config.text || '';
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
   * 创建图片渲染器（ImageCard）
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
      background: var(--bg-color, #f5f5f5);
      color: var(--text-color, #333);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .image-card {
      width: 100%;
    }
    .image-content {
      width: 100%;
    }
    .image-empty {
      padding: 28px 16px;
      text-align: center;
      color: #999;
      font-size: 14px;
    }
    .image-title {
      padding: 12px 16px 4px;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-color, #333);
      word-break: break-word;
    }
    .image-caption {
      padding: 4px 16px 12px;
      font-size: 14px;
      color: var(--text-secondary, #666);
      word-break: break-word;
    }

    .layout-single {
      display: flex;
      width: 100%;
    }
    .layout-single img {
      max-width: 100%;
      height: auto;
      display: block;
      border-radius: 4px;
    }

    .layout-grid {
      display: grid;
      width: 100%;
    }
    .layout-grid .grid-cell {
      position: relative;
      overflow: hidden;
      aspect-ratio: 1;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.04);
    }
    .layout-grid .grid-cell img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .layout-grid .grid-overflow {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 20px;
      font-weight: 600;
      background: rgba(0, 0, 0, 0.45);
    }

    .layout-long-scroll {
      display: flex;
      flex-direction: column;
      width: 100%;
    }
    .layout-long-scroll img {
      width: 100%;
      height: auto;
      display: block;
    }

    .layout-horizontal-scroll {
      display: flex;
      overflow-x: auto;
      overflow-y: hidden;
      width: 100%;
      -webkit-overflow-scrolling: touch;
    }
    .layout-horizontal-scroll img {
      height: 220px;
      width: auto;
      flex-shrink: 0;
      border-radius: 4px;
      object-fit: cover;
    }
  </style>
</head>
<body>
  <div class="image-card">
    <div class="image-content" id="image-container"></div>
    <div class="image-title" id="title"></div>
    <div class="image-caption" id="caption"></div>
  </div>
  <script>
    (function() {
      var config = window.CHIPS_CARD_CONFIG || {};
      var container = document.getElementById('image-container');
      var titleEl = document.getElementById('title');
      var captionEl = document.getElementById('caption');

      function toArray(value) {
        return Array.isArray(value) ? value : [];
      }

      function resolveImageSrc(item) {
        if (!item || typeof item !== 'object') return '';
        if (item.source === 'url' && item.url) return String(item.url);
        if (item.url) return String(item.url);
        if (item.file_path) return String(item.file_path);
        return '';
      }

      function createImageElement(item, className) {
        var img = document.createElement('img');
        img.src = resolveImageSrc(item);
        img.alt = item && item.alt ? String(item.alt) : '';
        img.title = item && item.title ? String(item.title) : '';
        if (className) {
          img.className = className;
        }
        return img;
      }

      function renderLegacySingle() {
        var imageSrc = config.image_file || config.src || config.url || config.image || '';
        if (!imageSrc) {
          container.innerHTML = '<div class="image-empty">暂无图片</div>';
          return;
        }

        var wrapper = document.createElement('div');
        wrapper.className = 'layout-single';
        wrapper.style.justifyContent = 'center';
        var img = document.createElement('img');
        img.src = String(imageSrc);
        var fitMode = config.fit_mode || config.fitMode || 'contain';
        if (fitMode && fitMode !== 'none') {
          img.style.objectFit = String(fitMode);
        }
        wrapper.appendChild(img);
        container.appendChild(wrapper);
      }

      var images = toArray(config.images).filter(function(item) {
        return resolveImageSrc(item);
      });

      if (images.length === 0) {
        renderLegacySingle();
      } else {
        var layoutType = images.length <= 1 ? 'single' : (config.layout_type || 'single');
        var layoutOptions = config.layout_options || {};
        var gap = Number(layoutOptions.gap);
        if (!isFinite(gap)) gap = 8;

        if (layoutType === 'single') {
          var single = document.createElement('div');
          single.className = 'layout-single';
          var align = layoutOptions.single_alignment || 'center';
          var justify = align === 'left' ? 'flex-start' : (align === 'right' ? 'flex-end' : 'center');
          single.style.justifyContent = justify;
          var widthPercent = Number(layoutOptions.single_width_percent);
          if (!isFinite(widthPercent)) widthPercent = 100;
          var singleImg = createImageElement(images[0], '');
          singleImg.style.width = Math.max(10, Math.min(100, widthPercent)) + '%';
          single.appendChild(singleImg);
          container.appendChild(single);
        } else if (layoutType === 'grid') {
          var grid = document.createElement('div');
          grid.className = 'layout-grid';
          grid.style.gap = gap + 'px';
          var gridMode = layoutOptions.grid_mode || '2x2';
          var cols = gridMode === '2x2' ? 2 : 3;
          grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
          var limit = gridMode === '3-column-infinite' ? images.length : (gridMode === '3x3' ? 9 : 4);
          var hasOverflow = images.length > limit && gridMode !== '3-column-infinite';
          var displayCount = hasOverflow ? limit : Math.min(images.length, limit);

          for (var i = 0; i < displayCount; i++) {
            var cell = document.createElement('div');
            cell.className = 'grid-cell';
            var img = createImageElement(images[i], '');
            cell.appendChild(img);
            if (hasOverflow && i === displayCount - 1) {
              var overlay = document.createElement('div');
              overlay.className = 'grid-overflow';
              overlay.textContent = '+' + String(images.length - limit + 1);
              cell.appendChild(overlay);
            }
            grid.appendChild(cell);
          }
          container.appendChild(grid);
        } else if (layoutType === 'long-scroll') {
          var longScroll = document.createElement('div');
          longScroll.className = 'layout-long-scroll';
          longScroll.style.gap = gap + 'px';
          var scrollMode = layoutOptions.scroll_mode || 'fixed-window';
          if (scrollMode === 'fixed-window') {
            var fixedHeight = Number(layoutOptions.fixed_window_height);
            if (!isFinite(fixedHeight)) fixedHeight = 600;
            longScroll.style.maxHeight = fixedHeight + 'px';
            longScroll.style.overflowY = 'auto';
          }
          images.forEach(function(item) {
            longScroll.appendChild(createImageElement(item, ''));
          });
          container.appendChild(longScroll);
        } else if (layoutType === 'horizontal-scroll') {
          var horizontal = document.createElement('div');
          horizontal.className = 'layout-horizontal-scroll';
          horizontal.style.gap = gap + 'px';
          images.forEach(function(item) {
            horizontal.appendChild(createImageElement(item, ''));
          });
          container.appendChild(horizontal);
        } else {
          renderLegacySingle();
        }
      }

      var title = config.title || '';
      if (!title && config.use_image_title_as_title === true && images[0] && images[0].title) {
        title = images[0].title;
      }
      var caption = config.caption || config.description || '';
      if (title) {
        titleEl.textContent = String(title);
      } else {
        titleEl.style.display = 'none';
      }
      if (caption) {
        captionEl.textContent = String(caption);
      } else {
        captionEl.style.display = 'none';
      }
    })();
  </script>
</body>
</html>
`,
      css: '',
    };
  }

  /**
   * 创建视频渲染器（VideoCard）
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
      // 兼容卡片文件格式规范字段名
      video.src = config.video_file || config.src || config.url || '';
      var poster = config.cover_image || config.poster || '';
      if (poster) video.poster = poster;
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
   * 创建音频渲染器（AudioCard）
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
      // 兼容卡片文件格式规范字段名
      audio.src = config.audio_file || config.src || config.url || '';
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
   * 创建代码渲染器（CodeBlockCard）
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
   * 创建 Markdown 渲染器（MarkdownCard）
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
