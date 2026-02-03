/**
 * ThemeProcessor - 主题处理模块
 *
 * 负责获取主题样式并应用到生成的 HTML 中
 */

import type { HTMLFileMap } from '../types';

/**
 * 主题定义
 */
export interface ThemeDefinition {
  /** 主题 ID */
  id: string;
  /** 主题名称 */
  name: string;
  /** CSS 变量 */
  variables: Record<string, string>;
  /** 组件样式 */
  componentStyles?: string;
}

/**
 * 处理结果
 */
export interface ThemeProcessResult {
  /** 是否成功 */
  success: boolean;
  /** 处理后的 HTML 文件 */
  htmlFiles?: HTMLFileMap;
  /** theme.css 内容 */
  themeCss?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 默认主题
 */
const DEFAULT_THEME: ThemeDefinition = {
  id: 'default',
  name: '默认主题',
  variables: {
    // 颜色
    '--primary-color': '#0066cc',
    '--secondary-color': '#6c757d',
    '--success-color': '#28a745',
    '--warning-color': '#ffc107',
    '--danger-color': '#dc3545',
    '--info-color': '#17a2b8',

    // 文本
    '--text-color': '#333333',
    '--text-secondary': '#666666',
    '--text-muted': '#999999',
    '--link-color': '#0066cc',

    // 背景
    '--bg-color': '#ffffff',
    '--bg-secondary': '#f8f9fa',
    '--page-bg': '#f5f5f5',
    '--card-bg': '#ffffff',

    // 边框
    '--border-color': '#dee2e6',
    '--border-radius': '8px',

    // 阴影
    '--card-shadow': '0 2px 8px rgba(0, 0, 0, 0.1)',
    '--card-shadow-hover': '0 4px 16px rgba(0, 0, 0, 0.15)',

    // 字体
    '--font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    '--font-mono': "Consolas, Monaco, 'Courier New', monospace",
    '--font-size-base': '16px',
    '--font-size-sm': '14px',
    '--font-size-lg': '18px',
    '--line-height-base': '1.6',

    // 间距
    '--spacing-xs': '4px',
    '--spacing-sm': '8px',
    '--spacing-md': '16px',
    '--spacing-lg': '24px',
    '--spacing-xl': '32px',

    // 卡片
    '--card-padding': '24px',
    '--card-gap': '16px',
    '--card-radius': '8px',
    '--card-max-width': '800px',

    // 代码
    '--code-bg': '#1e1e1e',
    '--code-color': '#d4d4d4',
    '--code-header-bg': '#2d2d2d',
    '--code-header-color': '#cccccc',
    '--code-inline-bg': '#f5f5f5',
  },
  componentStyles: `
/* 通用组件样式 */
:root {
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}
::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

/* 选中样式 */
::selection {
  background: var(--primary-color);
  color: #fff;
}
`,
};

/**
 * 主题处理器
 */
export class ThemeProcessor {
  private _themes: Map<string, ThemeDefinition> = new Map();

  constructor() {
    // 注册默认主题
    this._themes.set(DEFAULT_THEME.id, DEFAULT_THEME);
  }

  /**
   * 处理主题
   *
   * @param themeId - 主题 ID（可选，不传使用默认主题）
   * @param htmlFiles - HTML 文件映射
   * @returns 处理结果
   */
  async process(themeId: string | undefined, htmlFiles: HTMLFileMap): Promise<ThemeProcessResult> {
    try {
      // 获取主题
      const theme = await this._fetchTheme(themeId);

      // 生成 theme.css
      const themeCss = this._generateThemeCSS(theme);

      // 更新 HTML 文件（添加主题引用）
      const updatedFiles = this._updateHTMLFiles(htmlFiles);

      return {
        success: true,
        htmlFiles: updatedFiles,
        themeCss,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '主题处理失败',
      };
    }
  }

  /**
   * 注册主题
   *
   * @param theme - 主题定义
   */
  registerTheme(theme: ThemeDefinition): void {
    this._themes.set(theme.id, theme);
  }

  /**
   * 获取主题
   *
   * @param themeId - 主题 ID
   * @returns 主题定义
   */
  private async _fetchTheme(themeId: string | undefined): Promise<ThemeDefinition> {
    // 如果没有指定主题 ID，使用默认主题
    if (!themeId) {
      return DEFAULT_THEME;
    }

    // 先从本地缓存查找
    const cached = this._themes.get(themeId);
    if (cached) {
      return cached;
    }

    // TODO: 通过 SDK 的 ThemeManager 获取主题
    // 目前返回默认主题
    console.warn(`主题 "${themeId}" 未找到，使用默认主题`);
    return DEFAULT_THEME;
  }

  /**
   * 生成 theme.css
   *
   * @param theme - 主题定义
   * @returns CSS 字符串
   */
  private _generateThemeCSS(theme: ThemeDefinition): string {
    // 生成 CSS 变量声明
    const variables = Object.entries(theme.variables)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n');

    const css = `/**
 * 薯片生态主题样式
 * 主题: ${theme.name} (${theme.id})
 * 生成时间: ${new Date().toISOString()}
 */

:root {
${variables}
}

${theme.componentStyles ?? ''}
`;

    return css;
  }

  /**
   * 更新 HTML 文件
   *
   * 确保所有 HTML 文件都引用了 theme.css
   *
   * @param htmlFiles - HTML 文件映射
   * @returns 更新后的文件映射
   */
  private _updateHTMLFiles(htmlFiles: HTMLFileMap): HTMLFileMap {
    const updatedFiles: HTMLFileMap = new Map();

    for (const [path, content] of htmlFiles) {
      let updated = content;

      // 检查是否已有 theme.css 引用
      if (!content.includes('theme.css')) {
        // 计算相对路径
        const depth = path.split('/').length - 1;
        const relativePath = depth > 0 ? '../'.repeat(depth) : './';

        // 在 </head> 之前添加引用
        const linkTag = `<link rel="stylesheet" href="${relativePath}theme.css">`;

        if (updated.includes('</head>')) {
          updated = updated.replace('</head>', `  ${linkTag}\n</head>`);
        } else if (updated.includes('<body>')) {
          // 如果没有 head 标签，在 body 开头添加 style
          updated = updated.replace('<body>', `<head>\n  ${linkTag}\n</head>\n<body>`);
        }
      }

      updatedFiles.set(path, updated);
    }

    return updatedFiles;
  }
}

/**
 * 创建处理器实例
 */
export function createThemeProcessor(): ThemeProcessor {
  return new ThemeProcessor();
}

/**
 * 默认处理器实例
 */
export const themeProcessor = createThemeProcessor();
