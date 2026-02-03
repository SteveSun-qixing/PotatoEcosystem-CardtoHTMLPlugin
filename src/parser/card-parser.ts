/**
 * CardParser - 卡片解析模块
 *
 * 负责解析 .card 文件，提取卡片元数据、结构信息、基础卡片配置和资源引用
 */

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
      if (!baseCardsResult.success && this._options.strict) {
        return {
          success: false,
          error: baseCardsResult.error,
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
   */
  private async _loadCardFiles(source: ConversionSource): Promise<Map<string, Uint8Array>> {
    const files = new Map<string, Uint8Array>();

    if (source.type === 'path' && source.path) {
      // 从文件路径加载
      // TODO: 调用 SDK 的 FileAPI 读取文件
      // TODO: 调用 Foundation 的 ZIPProcessor 解压
      // 临时实现：返回空映射，实际需要集成 SDK
      throw new Error(`文件加载尚未实现: ${source.path}`);
    } else if (source.type === 'data' && source.data) {
      // 从数据加载
      // TODO: 调用 Foundation 的 ZIPProcessor 解压数据
      throw new Error('数据加载尚未实现');
    } else {
      throw new Error('无效的转换源：必须提供 path 或 data');
    }

    return files;
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
      // TODO: 调用 Foundation 的 DataSerializer 解析 YAML
      const yamlString = new TextDecoder().decode(metadataContent);
      const rawMetadata = this._parseYAML(yamlString);

      // 验证必需字段
      if (!rawMetadata.id || !rawMetadata.name) {
        return {
          success: false,
          error: {
            code: 'CONV-HTML-003' as ErrorCode,
            message: 'metadata.yaml 缺少必需字段：id 或 name',
            filePath: metadataPath,
          },
        };
      }

      const metadata: CardMetadata = {
        id: String(rawMetadata.id),
        name: String(rawMetadata.name),
        version: String(rawMetadata.version ?? '1.0.0'),
        description: rawMetadata.description ? String(rawMetadata.description) : undefined,
        createdAt: String(rawMetadata.created_at ?? new Date().toISOString()),
        modifiedAt: String(rawMetadata.modified_at ?? new Date().toISOString()),
        themeId: rawMetadata.theme ? String(rawMetadata.theme) : undefined,
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

      // 提取基础卡片 ID 列表
      let baseCardIds: string[] = [];
      if (Array.isArray(rawStructure.base_cards)) {
        baseCardIds = rawStructure.base_cards.map((card: unknown) => {
          if (typeof card === 'string') return card;
          if (typeof card === 'object' && card !== null && 'id' in card) {
            return String((card as { id: unknown }).id);
          }
          return '';
        }).filter(Boolean);
      }

      const structure: CardStructure = {
        baseCardIds,
        layout: rawStructure.layout ? {
          type: String(rawStructure.layout.type ?? 'vertical'),
          params: rawStructure.layout.params,
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
      const configPath = `content/${cardId}/config.yaml`;
      const configContent = files.get(configPath);

      if (!configContent) {
        const warning = `基础卡片配置文件不存在: ${configPath}`;
        warnings.push(warning);
        if (this._options.strict) {
          hasError = true;
          lastError = {
            code: 'CONV-HTML-005' as ErrorCode,
            message: warning,
            filePath: configPath,
            cardId,
          };
        }
        continue;
      }

      try {
        const yamlString = new TextDecoder().decode(configContent);
        const rawConfig = this._parseYAML(yamlString);

        const baseCard: BaseCardConfig = {
          id: cardId,
          type: String(rawConfig.type ?? 'unknown'),
          name: rawConfig.name ? String(rawConfig.name) : undefined,
          config: rawConfig.config ?? {},
          resources: this._extractResourceReferences(rawConfig, cardId),
        };

        baseCards.push(baseCard);
      } catch (error) {
        const warning = `基础卡片配置解析失败 (${cardId}): ${error instanceof Error ? error.message : '未知错误'}`;
        warnings.push(warning);
        if (this._options.strict) {
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
   * @param config - 配置对象
   * @param cardId - 卡片 ID
   * @returns 资源引用列表
   */
  private _extractResourceReferences(config: Record<string, unknown>, cardId: string): ResourceReference[] {
    const resources: ResourceReference[] = [];
    const resourceFields = ['image', 'video', 'audio', 'file', 'src', 'url', 'path'];

    const extractFromValue = (value: unknown, parentKey: string): void => {
      if (typeof value === 'string' && this._isResourcePath(value)) {
        const type = this._inferResourceType(value, parentKey);
        resources.push({
          id: `${cardId}-${resources.length}`,
          type,
          originalPath: value,
          isInternal: !value.startsWith('/') && !value.startsWith('http'),
          isNetwork: value.startsWith('http://') || value.startsWith('https://'),
        });
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => extractFromValue(item, `${parentKey}[${index}]`));
      } else if (typeof value === 'object' && value !== null) {
        Object.entries(value).forEach(([key, val]) => extractFromValue(val, key));
      }
    };

    resourceFields.forEach(field => {
      if (field in config) {
        extractFromValue(config[field], field);
      }
    });

    // 递归检查 config 字段
    if (config.config && typeof config.config === 'object') {
      Object.entries(config.config).forEach(([key, val]) => extractFromValue(val, key));
    }

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
   * 简易 YAML 解析器
   * 注意：这是一个简化实现，生产环境应使用 js-yaml 或调用 Foundation 的 DataSerializer
   */
  private _parseYAML(yamlString: string): Record<string, unknown> {
    // TODO: 替换为调用 Foundation 的 DataSerializer
    // 临时使用简易解析，只支持基本格式
    const result: Record<string, unknown> = {};
    const lines = yamlString.split('\n');
    let currentKey = '';
    let currentIndent = 0;
    const stack: { obj: Record<string, unknown>; indent: number }[] = [{ obj: result, indent: -1 }];

    for (const line of lines) {
      // 跳过空行和注释
      if (!line.trim() || line.trim().startsWith('#')) {
        continue;
      }

      const indent = line.search(/\S/);
      const content = line.trim();

      // 检查是否是键值对
      const colonIndex = content.indexOf(':');
      if (colonIndex > 0) {
        const key = content.substring(0, colonIndex).trim();
        const value = content.substring(colonIndex + 1).trim();

        // 调整栈
        while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) {
          stack.pop();
        }

        const currentObj = stack[stack.length - 1]!.obj;

        if (value) {
          // 有值
          currentObj[key] = this._parseYAMLValue(value);
        } else {
          // 没有值，可能是对象或数组的开始
          const newObj: Record<string, unknown> = {};
          currentObj[key] = newObj;
          stack.push({ obj: newObj, indent });
        }
        currentKey = key;
        currentIndent = indent;
      } else if (content.startsWith('- ')) {
        // 数组元素
        const value = content.substring(2).trim();
        const currentObj = stack[stack.length - 1]!.obj;

        // 找到正确的数组
        if (!Array.isArray(currentObj[currentKey])) {
          currentObj[currentKey] = [];
        }
        (currentObj[currentKey] as unknown[]).push(this._parseYAMLValue(value));
      }
    }

    return result;
  }

  /**
   * 解析 YAML 值
   */
  private _parseYAMLValue(value: string): unknown {
    // 移除引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // 布尔值
    if (value === 'true') return true;
    if (value === 'false') return false;

    // null
    if (value === 'null' || value === '~') return null;

    // 数字
    const num = Number(value);
    if (!isNaN(num)) return num;

    return value;
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
