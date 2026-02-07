/**
 * CardParser - 卡片解析模块
 *
 * 负责解析 .card 文件，提取卡片元数据、结构信息、基础卡片配置和资源引用
 * 
 * 通过 Foundation 的 ZIPProcessor 解压卡片文件，使用 DataSerializer 解析 YAML 配置
 */

import { zipProcessor, dataSerializer } from '@chips/foundation';
import type {
  ConversionSource,
  CardData,
  CardMetadata,
  CardStructure,
  BaseCardConfig,
  ResourceReference,
  ResourceType,
  ConversionError,
  ErrorCode,
} from '../types';

/**
 * 解析结果
 */
export interface ParseResult {
  /** 是否成功 */
  success: boolean;
  /** 卡片数据（成功时） */
  data?: CardData;
  /** 错误信息（失败时） */
  error?: ConversionError;
  /** 警告列表 */
  warnings?: string[];
}

/**
 * CardParser 配置选项
 */
export interface CardParserOptions {
  /** 是否严格模式（遇到任何错误都中止） */
  strict?: boolean;
  /** 是否保留原始文件内容 */
  keepRawFiles?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: CardParserOptions = {
  strict: false,
  keepRawFiles: true,
};

/**
 * 卡片解析器
 */
export class CardParser {
  private _options: CardParserOptions;

  /**
   * 创建卡片解析器实例
   *
   * @param options - 配置选项
   */
  constructor(options?: CardParserOptions) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 解析卡片
   *
   * @param source - 转换源（文件路径或数据）
   * @returns 解析结果
   */
  async parse(source: ConversionSource): Promise<ParseResult> {
    const warnings: string[] = [];

    try {
      // 1. 获取卡片文件内容
      const rawFiles = await this._loadCardFiles(source);

      // 2. 解析 metadata.yaml
      const metadataResult = await this._parseMetadata(rawFiles);
      if (!metadataResult.success) {
        return {
          success: false,
          error: metadataResult.error,
          warnings,
        };
      }
      const metadata = metadataResult.data!;

      // 3. 解析 structure.yaml
      const structureResult = await this._parseStructure(rawFiles);
      if (!structureResult.success) {
        return {
          success: false,
          error: structureResult.error,
          warnings,
        };
      }
      const structure = structureResult.data!;

      // 4. 解析基础卡片配置
      const baseCardsResult = await this._parseBaseCards(rawFiles, structure.baseCardIds);
      if (baseCardsResult.warnings) {
        warnings.push(...baseCardsResult.warnings);
      }
      if (!baseCardsResult.success) {
        return {
          success: false,
          error: baseCardsResult.error ?? {
            code: 'CONV-HTML-005' as ErrorCode,
            message: '基础卡片配置解析失败',
          },
          warnings,
        };
      }
      const baseCards = baseCardsResult.data ?? [];

      // 5. 收集资源引用
      const resources = this._collectResources(baseCards, rawFiles);

      // 构建卡片数据
      const cardData: CardData = {
        metadata,
        structure,
        baseCards,
        resources,
        rawFiles: this._options.keepRawFiles ? rawFiles : undefined,
      };

      return {
        success: true,
        data: cardData,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONV-HTML-002' as ErrorCode,
          message: error instanceof Error ? error.message : '卡片解析失败',
          cause: error instanceof Error ? error : undefined,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  }

  /**
   * 加载卡片文件内容
   *
   * @param source - 转换源
   * @returns 文件映射（路径 -> 内容）
   * 
   * @remarks
   * 支持三种数据源：
   * - type: 'files' + files: Map - 文件夹结构（编辑器常用），直接使用传入的文件映射
   * - type: 'data' + data: Uint8Array - 标准卡片文件（ZIP），使用 Foundation.zipProcessor 解压
   * - type: 'path' - 不直接支持，调用方需要先读取文件内容
   */
  private async _loadCardFiles(source: ConversionSource): Promise<Map<string, Uint8Array>> {
    if (source.type === 'files' && source.files) {
      // 文件夹结构：直接使用传入的文件映射（编辑器常用方式）
      return source.files;
    } else if (source.type === 'data' && source.data) {
      // 标准卡片文件（ZIP）：使用 Foundation 的 ZIPProcessor 解压
      try {
        const extractedFiles = await zipProcessor.extract(source.data);
        return extractedFiles;
      } catch (error) {
        throw new Error(
          `卡片文件解压失败: ${error instanceof Error ? error.message : '未知错误'}`
        );
      }
    } else if (source.type === 'path' && source.path) {
      // path 类型需要调用方先读取文件内容
      throw new Error(
        `不支持直接从路径加载，请先读取文件内容后使用 type: 'files' 或 'data' 方式传入。路径: ${source.path}`
      );
    } else {
      throw new Error('无效的转换源：必须提供 files（文件夹结构）或 data（ZIP数据）');
    }
  }

  /**
   * 解析元数据
   *
   * @param files - 文件映射
   * @returns 解析结果
   */
  private async _parseMetadata(
    files: Map<string, Uint8Array>
  ): Promise<{ success: boolean; data?: CardMetadata; error?: ConversionError }> {
    const metadataPath = '.card/metadata.yaml';
    const metadataContent = files.get(metadataPath);

    if (!metadataContent) {
      return {
        success: false,
        error: {
          code: 'CONV-HTML-003' as ErrorCode,
          message: 'metadata.yaml 文件不存在',
          filePath: metadataPath,
        },
      };
    }

    try {
      // 使用 Foundation 的 DataSerializer 解析 YAML
      const yamlString = new TextDecoder().decode(metadataContent);
      const rawMetadata = this._parseYAML(yamlString);

      // 验证必需字段（支持协议规范的 card_id 和向后兼容的 id）
      const cardId = rawMetadata.card_id ?? rawMetadata.id;
      if (!cardId || !rawMetadata.name) {
        return {
          success: false,
          error: {
            code: 'CONV-HTML-003' as ErrorCode,
            message: 'metadata.yaml 缺少必需字段：card_id（或 id）、name',
            filePath: metadataPath,
          },
        };
      }

      // 支持协议规范的 theme_id 和向后兼容的 theme
      const themeId = rawMetadata.theme_id ?? rawMetadata.theme;

      const metadata: CardMetadata = {
        id: String(cardId),
        name: String(rawMetadata.name),
        version: String(rawMetadata.version ?? '1.0.0'),
        description: rawMetadata.description ? String(rawMetadata.description) : undefined,
        createdAt: String(rawMetadata.created_at ?? new Date().toISOString()),
        modifiedAt: String(rawMetadata.modified_at ?? new Date().toISOString()),
        themeId: themeId ? String(themeId) : undefined,
        tags: Array.isArray(rawMetadata.tags) ? rawMetadata.tags.map(String) : undefined,
        chipsStandardsVersion: String(rawMetadata.chips_standards_version ?? '1.0.0'),
      };

      return { success: true, data: metadata };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONV-HTML-003' as ErrorCode,
          message: `metadata.yaml 解析失败: ${error instanceof Error ? error.message : '未知错误'}`,
          filePath: metadataPath,
          cause: error instanceof Error ? error : undefined,
        },
      };
    }
  }

  /**
   * 解析结构定义
   *
   * @param files - 文件映射
   * @returns 解析结果
   */
  private async _parseStructure(
    files: Map<string, Uint8Array>
  ): Promise<{ success: boolean; data?: CardStructure; error?: ConversionError }> {
    const structurePath = '.card/structure.yaml';
    const structureContent = files.get(structurePath);

    if (!structureContent) {
      return {
        success: false,
        error: {
          code: 'CONV-HTML-004' as ErrorCode,
          message: 'structure.yaml 文件不存在',
          filePath: structurePath,
        },
      };
    }

    try {
      const yamlString = new TextDecoder().decode(structureContent);
      const rawStructure = this._parseYAML(yamlString);

      // 提取基础卡片 ID 列表（仅支持标准 structure 字段）
      let baseCardIds: string[] = [];
      const cardList = rawStructure.structure;
      if (Array.isArray(cardList)) {
        const invalidIndex = cardList.findIndex(
          (card) =>
            typeof card !== 'object' ||
            card === null ||
            typeof (card as { id?: unknown }).id !== 'string' ||
            !(card as { id: string }).id
        );
        if (invalidIndex >= 0) {
          return {
            success: false,
            error: {
              code: 'CONV-HTML-004' as ErrorCode,
              message: `structure.yaml 结构无效: structure[${invalidIndex}] 缺少标准 id 字段`,
              filePath: structurePath,
            },
          };
        }

        baseCardIds = cardList.map((card) => String((card as { id: unknown }).id));
      }

      const structure: CardStructure = {
        baseCardIds,
        layout: rawStructure.layout && typeof rawStructure.layout === 'object' ? {
          type: String((rawStructure.layout as any).type ?? 'vertical'),
          params: (rawStructure.layout as any).params as Record<string, unknown> | undefined,
        } : undefined,
      };

      return { success: true, data: structure };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONV-HTML-004' as ErrorCode,
          message: `structure.yaml 解析失败: ${error instanceof Error ? error.message : '未知错误'}`,
          filePath: structurePath,
          cause: error instanceof Error ? error : undefined,
        },
      };
    }
  }

  /**
   * 解析基础卡片配置
   *
   * @param files - 文件映射
   * @param baseCardIds - 基础卡片 ID 列表
   * @returns 解析结果
   */
  private async _parseBaseCards(
    files: Map<string, Uint8Array>,
    baseCardIds: string[]
  ): Promise<{ success: boolean; data?: BaseCardConfig[]; error?: ConversionError; warnings?: string[] }> {
    const baseCards: BaseCardConfig[] = [];
    const warnings: string[] = [];
    let hasError = false;
    let lastError: ConversionError | undefined;

    for (const cardId of baseCardIds) {
      const singleFilePath = `content/${cardId}.yaml`;
      let configContent = files.get(singleFilePath);
      let configPath = singleFilePath;

      if (!configContent) {
        const warning = `基础卡片配置文件不存在: ${singleFilePath}`;
        warnings.push(warning);
        hasError = true;
        lastError = {
          code: 'CONV-HTML-005' as ErrorCode,
          message: warning,
          filePath: configPath,
          cardId,
        };
        continue;
      }

      try {
        const yamlString = new TextDecoder().decode(configContent);
        const rawConfig = this._parseYAML(yamlString);
        const type = typeof rawConfig.type === 'string' ? rawConfig.type.trim() : '';
        const config = rawConfig.data;
        if (!type || typeof config !== 'object' || config === null || Array.isArray(config)) {
          throw new Error('基础卡片内容必须为标准格式: { type: string, data: object }');
        }

        const baseCard: BaseCardConfig = {
          id: cardId,
          type,
          name: rawConfig.name ? String(rawConfig.name) : undefined,
          config: config as Record<string, unknown>,
          resources: this._extractResourceReferences(config as Record<string, unknown>, cardId),
        };

        baseCards.push(baseCard);
      } catch (error) {
        const warning = `基础卡片配置解析失败 (${cardId}): ${error instanceof Error ? error.message : '未知错误'}`;
        warnings.push(warning);
        hasError = true;
        lastError = {
          code: 'CONV-HTML-005' as ErrorCode,
          message: warning,
          filePath: configPath,
          cardId,
          cause: error instanceof Error ? error : undefined,
        };
      }
    }

    return {
      success: !hasError,
      data: baseCards,
      error: lastError,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * 提取资源引用
   *
   * @param rawConfig - 原始配置对象（完整的YAML解析结果）
   * @param cardId - 卡片 ID
   * @returns 资源引用列表
   *
   * @remarks
   * 使用两种策略提取资源引用：
   * 1. 特定字段匹配：已知的资源路径字段名（file_path, image_file 等）
   * 2. 通用路径检测：通过文件扩展名和 URL 模式识别资源路径
   */
  private _extractResourceReferences(rawConfig: Record<string, unknown>, cardId: string): ResourceReference[] {
    const resources: ResourceReference[] = [];
    const addedPaths = new Set<string>();

    // 已知的资源路径字段名
    const knownResourceFields = new Set([
      'file_path', 'image_file', 'video_file', 'audio_file',
      'src', 'url', 'path', 'image', 'video', 'audio', 'file',
    ]);

    const addResource = (value: string, parentKey: string): void => {
      if (addedPaths.has(value)) return;
      addedPaths.add(value);

      const type = this._inferResourceType(value, parentKey);
      resources.push({
        id: `${cardId}-${resources.length}`,
        type,
        originalPath: value,
        isInternal: !value.startsWith('/') && !value.startsWith('http'),
        isNetwork: value.startsWith('http://') || value.startsWith('https://'),
      });
    };

    const extractFromValue = (value: unknown, parentKey: string): void => {
      if (typeof value === 'string') {
        // 策略1: 已知资源字段名 — 只要有值且不是明显的非路径值就提取
        if (knownResourceFields.has(parentKey) && value.trim().length > 0) {
          // 排除 blob URL（临时预览，不应出现在保存后的配置中，但做向后兼容）
          if (!value.startsWith('blob:')) {
            addResource(value, parentKey);
          }
        }
        // 策略2: 通用路径检测（通过扩展名或URL模式）
        else if (this._isResourcePath(value)) {
          addResource(value, parentKey);
        }
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => extractFromValue(item, `${parentKey}[${index}]`));
      } else if (typeof value === 'object' && value !== null) {
        Object.entries(value).forEach(([key, val]) => extractFromValue(val, key));
      }
    };

    // 递归遍历整个配置对象提取资源
    const traverseConfig = (obj: Record<string, unknown>): void => {
      for (const [key, value] of Object.entries(obj)) {
        // 跳过元字段
        if (['type', 'card_type', 'name', 'id'].includes(key)) {
          continue;
        }
        extractFromValue(value, key);
      }
    };

    traverseConfig(rawConfig);

    return resources;
  }

  /**
   * 判断是否为资源路径
   */
  private _isResourcePath(value: string): boolean {
    // 检查是否为文件路径或 URL
    const resourceExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
      '.mp4', '.webm', '.ogg', '.mov',
      '.mp3', '.wav', '.flac', '.aac',
      '.woff', '.woff2', '.ttf', '.otf',
      '.pdf', '.doc', '.docx',
    ];

    const lowerValue = value.toLowerCase();
    return (
      resourceExtensions.some(ext => lowerValue.endsWith(ext)) ||
      lowerValue.startsWith('http://') ||
      lowerValue.startsWith('https://') ||
      lowerValue.startsWith('./') ||
      lowerValue.startsWith('../')
    );
  }

  /**
   * 推断资源类型
   */
  private _inferResourceType(path: string, fieldName: string): ResourceType {
    const lowerPath = path.toLowerCase();
    const lowerField = fieldName.toLowerCase();

    if (lowerField.includes('image') || lowerField.includes('img') || lowerField.includes('photo')) {
      return 'image';
    }
    if (lowerField.includes('video')) {
      return 'video';
    }
    if (lowerField.includes('audio') || lowerField.includes('sound') || lowerField.includes('music')) {
      return 'audio';
    }
    if (lowerField.includes('font')) {
      return 'font';
    }

    // 根据扩展名判断
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(lowerPath)) {
      return 'image';
    }
    if (/\.(mp4|webm|ogg|mov)$/i.test(lowerPath)) {
      return 'video';
    }
    if (/\.(mp3|wav|flac|aac)$/i.test(lowerPath)) {
      return 'audio';
    }
    if (/\.(woff|woff2|ttf|otf)$/i.test(lowerPath)) {
      return 'font';
    }

    return 'other';
  }

  /**
   * 收集所有资源引用
   *
   * @param baseCards - 基础卡片列表
   * @param files - 文件映射
   * @returns 资源引用列表
   */
  private _collectResources(
    baseCards: BaseCardConfig[],
    files: Map<string, Uint8Array>
  ): ResourceReference[] {
    const resourceMap = new Map<string, ResourceReference>();

    // 从基础卡片配置收集
    for (const card of baseCards) {
      if (card.resources) {
        for (const resource of card.resources) {
          if (!resourceMap.has(resource.originalPath)) {
            resourceMap.set(resource.originalPath, resource);
          }
        }
      }
    }

    // 从文件列表中查找资源文件
    for (const filePath of files.keys()) {
      if (this._isResourcePath(filePath) && !resourceMap.has(filePath)) {
        const type = this._inferResourceType(filePath, '');
        resourceMap.set(filePath, {
          id: `file-${resourceMap.size}`,
          type,
          originalPath: filePath,
          isInternal: true,
          isNetwork: false,
        });
      }
    }

    return Array.from(resourceMap.values());
  }

  /**
   * 解析 YAML 字符串
   * 
   * 使用 Foundation 的 DataSerializer 进行解析，支持完整的 YAML 语法
   * 
   * @param yamlString - YAML 格式的字符串
   * @returns 解析后的对象
   */
  private _parseYAML(yamlString: string): Record<string, unknown> {
    return dataSerializer.parseYAML(yamlString) as Record<string, unknown>;
  }
}

/**
 * 创建解析器实例
 */
export function createParser(options?: CardParserOptions): CardParser {
  return new CardParser(options);
}

/**
 * 默认解析器实例
 */
export const parser = createParser();
