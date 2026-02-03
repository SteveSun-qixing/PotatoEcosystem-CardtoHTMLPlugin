/**
 * ResourceHandler - 资源处理模块
 *
 * 负责处理卡片中的资源文件并更新 HTML 中的引用
 */

import type {
  HTMLFileMap,
  ResourceFileMap,
  ResourceReference,
  ResourceType,
  AssetStrategy,
  ProcessedResource,
} from '../types';

/**
 * 资源处理结果
 */
export interface ResourceHandleResult {
  /** 是否成功 */
  success: boolean;
  /** 处理后的 HTML 文件 */
  htmlFiles?: HTMLFileMap;
  /** 资源文件映射 */
  resourceFiles?: ResourceFileMap;
  /** 错误信息 */
  error?: string;
  /** 警告列表 */
  warnings?: string[];
}

/**
 * 资源处理器配置
 */
export interface ResourceHandlerOptions {
  /** 资源处理策略 */
  strategy?: AssetStrategy;
  /** 是否下载网络资源 */
  downloadNetworkResources?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: ResourceHandlerOptions = {
  strategy: 'copy-local',
  downloadNetworkResources: false,
};

/**
 * 资源类型到目录名的映射
 */
const TYPE_TO_DIR: Record<ResourceType, string> = {
  image: 'images',
  video: 'videos',
  audio: 'audios',
  font: 'fonts',
  other: 'files',
};

/**
 * 资源处理器
 */
export class ResourceHandler {
  private _options: ResourceHandlerOptions;

  /**
   * 创建资源处理器实例
   *
   * @param options - 配置选项
   */
  constructor(options?: ResourceHandlerOptions) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 处理资源
   *
   * @param htmlFiles - HTML 文件映射
   * @param resources - 资源引用列表
   * @param rawFiles - 原始文件内容（用于内部资源）
   * @returns 处理结果
   */
  async handle(
    htmlFiles: HTMLFileMap,
    resources: ResourceReference[],
    rawFiles?: Map<string, Uint8Array>
  ): Promise<ResourceHandleResult> {
    const warnings: string[] = [];
    const processedResources: ProcessedResource[] = [];
    const resourceFiles: ResourceFileMap = new Map();

    try {
      // 1. 处理每个资源
      for (const resource of resources) {
        const result = await this._processResource(resource, rawFiles);
        if (result) {
          processedResources.push(result);
          resourceFiles.set(result.outputPath, result.content);
        } else if (!resource.isNetwork) {
          warnings.push(`资源处理失败: ${resource.originalPath}`);
        }
      }

      // 2. 更新 HTML 中的资源引用
      const updatedHtmlFiles = this._updateReferences(htmlFiles, processedResources);

      return {
        success: true,
        htmlFiles: updatedHtmlFiles,
        resourceFiles,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '资源处理失败',
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  }

  /**
   * 处理单个资源
   *
   * @param resource - 资源引用
   * @param rawFiles - 原始文件内容
   * @returns 处理后的资源或 null
   */
  private async _processResource(
    resource: ResourceReference,
    rawFiles?: Map<string, Uint8Array>
  ): Promise<ProcessedResource | null> {
    const strategy = this._options.strategy ?? 'copy-local';

    // 网络资源处理
    if (resource.isNetwork) {
      if (strategy === 'copy-all' && this._options.downloadNetworkResources) {
        // TODO: 下载网络资源
        return null;
      }
      // 保留网络引用，不处理
      return null;
    }

    // 本地资源处理
    if (strategy === 'reference-only') {
      // 只更新引用，不复制
      return null;
    }

    // 获取资源内容
    const content = rawFiles?.get(resource.originalPath);
    if (!content) {
      // 尝试不同的路径格式
      const altPath = resource.originalPath.startsWith('./')
        ? resource.originalPath.slice(2)
        : `./${resource.originalPath}`;
      const altContent = rawFiles?.get(altPath);
      if (!altContent) {
        return null;
      }
    }

    // 生成输出路径
    const dir = TYPE_TO_DIR[resource.type];
    const filename = this._extractFilename(resource.originalPath);
    const outputPath = `assets/${dir}/${filename}`;

    return {
      originalPath: resource.originalPath,
      outputPath,
      content: content!,
      type: resource.type,
    };
  }

  /**
   * 更新 HTML 中的资源引用
   *
   * @param htmlFiles - HTML 文件映射
   * @param resources - 处理后的资源列表
   * @returns 更新后的 HTML 文件映射
   */
  private _updateReferences(
    htmlFiles: HTMLFileMap,
    resources: ProcessedResource[]
  ): HTMLFileMap {
    const updatedFiles: HTMLFileMap = new Map();

    // 构建路径映射
    const pathMap = new Map<string, string>();
    for (const resource of resources) {
      pathMap.set(resource.originalPath, resource.outputPath);

      // 也添加没有 ./ 前缀的版本
      if (resource.originalPath.startsWith('./')) {
        pathMap.set(resource.originalPath.slice(2), resource.outputPath);
      } else {
        pathMap.set(`./${resource.originalPath}`, resource.outputPath);
      }
    }

    for (const [path, content] of htmlFiles) {
      let updated = content;

      // 计算相对路径前缀
      const depth = path.split('/').length - 1;
      const relativePath = depth > 0 ? '../'.repeat(depth) : './';

      // 替换所有资源引用
      for (const [original, output] of pathMap) {
        // 替换各种可能的引用格式
        const patterns = [
          new RegExp(`src=["']${this._escapeRegex(original)}["']`, 'g'),
          new RegExp(`href=["']${this._escapeRegex(original)}["']`, 'g'),
          new RegExp(`url\\(["']?${this._escapeRegex(original)}["']?\\)`, 'g'),
        ];

        for (const pattern of patterns) {
          const replacement = pattern.source.startsWith('url')
            ? `url("${relativePath}${output}")`
            : pattern.source.startsWith('src')
              ? `src="${relativePath}${output}"`
              : `href="${relativePath}${output}"`;

          updated = updated.replace(pattern, replacement);
        }
      }

      updatedFiles.set(path, updated);
    }

    return updatedFiles;
  }

  /**
   * 提取文件名
   *
   * @param path - 文件路径
   * @returns 文件名
   */
  private _extractFilename(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1] ?? 'unknown';
  }

  /**
   * 转义正则表达式特殊字符
   */
  private _escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * 创建处理器实例
 */
export function createResourceHandler(options?: ResourceHandlerOptions): ResourceHandler {
  return new ResourceHandler(options);
}

/**
 * 默认处理器实例
 */
export const resourceHandler = createResourceHandler();
