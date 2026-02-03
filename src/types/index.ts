/**
 * CardtoHTMLPlugin 类型定义
 *
 * 定义插件使用的所有数据结构和接口类型
 */

// ============================================================================
// 卡片数据结构
// ============================================================================

/**
 * 卡片元数据
 */
export interface CardMetadata {
  /** 卡片 ID */
  id: string;
  /** 卡片名称 */
  name: string;
  /** 卡片版本 */
  version: string;
  /** 卡片描述 */
  description?: string;
  /** 创建时间 (ISO 8601) */
  createdAt: string;
  /** 修改时间 (ISO 8601) */
  modifiedAt: string;
  /** 主题 ID */
  themeId?: string;
  /** 标签列表 */
  tags?: string[];
  /** 薯片标准版本 */
  chipsStandardsVersion: string;
}

/**
 * 卡片结构定义
 */
export interface CardStructure {
  /** 基础卡片 ID 列表（按顺序） */
  baseCardIds: string[];
  /** 布局配置 */
  layout?: {
    /** 布局类型 */
    type: string;
    /** 布局参数 */
    params?: Record<string, unknown>;
  };
}

/**
 * 基础卡片配置
 */
export interface BaseCardConfig {
  /** 基础卡片 ID */
  id: string;
  /** 基础卡片类型（如 rich-text, image, video） */
  type: string;
  /** 卡片名称 */
  name?: string;
  /** 配置数据 */
  config: Record<string, unknown>;
  /** 资源引用列表 */
  resources?: ResourceReference[];
}

/**
 * 资源引用
 */
export interface ResourceReference {
  /** 资源 ID */
  id: string;
  /** 资源类型（image, video, audio, font, other） */
  type: ResourceType;
  /** 原始路径 */
  originalPath: string;
  /** 是否为内部资源 */
  isInternal: boolean;
  /** 是否为网络资源 */
  isNetwork: boolean;
}

/**
 * 资源类型
 */
export type ResourceType = 'image' | 'video' | 'audio' | 'font' | 'other';

/**
 * 解析后的卡片数据
 */
export interface CardData {
  /** 元数据 */
  metadata: CardMetadata;
  /** 结构定义 */
  structure: CardStructure;
  /** 基础卡片配置列表 */
  baseCards: BaseCardConfig[];
  /** 所有资源引用 */
  resources: ResourceReference[];
  /** 原始文件内容（用于资源提取） */
  rawFiles?: Map<string, Uint8Array>;
}

// ============================================================================
// 渲染代码结构
// ============================================================================

/**
 * 渲染代码
 */
export interface RendererCode {
  /** HTML 模板 */
  html: string;
  /** CSS 样式 */
  css: string;
  /** JavaScript 代码（可选） */
  js?: string;
  /** 依赖的外部脚本 */
  externalScripts?: string[];
  /** 依赖的外部样式 */
  externalStyles?: string[];
}

/**
 * 渲染代码映射（类型 -> 渲染代码）
 */
export type RendererCodeMap = Map<string, RendererCode>;

// ============================================================================
// 转换选项和结果
// ============================================================================

/**
 * 资源处理策略
 */
export type AssetStrategy =
  /** 复制所有资源 */
  | 'copy-all'
  /** 复制本地资源，保留网络引用 */
  | 'copy-local'
  /** 嵌入为 base64 */
  | 'embed'
  /** 只更新引用，不复制 */
  | 'reference-only';

/**
 * 转换选项
 */
export interface ConversionOptions {
  /** 输出目录路径（不指定则返回数据） */
  outputPath?: string;
  /** 是否包含资源文件 */
  includeAssets?: boolean;
  /** 主题 ID（覆盖卡片配置） */
  themeId?: string;
  /** 资源处理策略 */
  assetStrategy?: AssetStrategy;
  /** 并行处理数量 */
  parallelCount?: number;
  /** 进度回调 */
  onProgress?: (progress: ProgressInfo) => void;
}

/**
 * 转换状态
 */
export type ConversionStatus =
  | 'pending'
  | 'parsing'
  | 'rendering'
  | 'processing'
  | 'writing'
  | 'completed'
  | 'failed';

/**
 * 进度信息
 */
export interface ProgressInfo {
  /** 任务 ID */
  taskId: string;
  /** 当前状态 */
  status: ConversionStatus;
  /** 完成百分比 (0-100) */
  percent: number;
  /** 当前步骤描述 */
  currentStep?: string;
}

/**
 * 转换统计
 */
export interface ConversionStats {
  /** 耗时（毫秒） */
  duration: number;
  /** 输入大小（字节） */
  inputSize: number;
  /** 输出大小（字节） */
  outputSize: number;
  /** 基础卡片数量 */
  baseCardCount: number;
  /** 资源文件数量 */
  resourceCount: number;
}

/**
 * 转换结果
 */
export interface ConversionResult {
  /** 是否成功 */
  success: boolean;
  /** 任务 ID */
  taskId: string;
  /** 输出路径（如果指定了 outputPath） */
  outputPath?: string;
  /** 输出数据（如果未指定 outputPath） */
  data?: OutputData;
  /** 错误信息（如果失败） */
  error?: ConversionError;
  /** 警告列表 */
  warnings?: string[];
  /** 转换统计 */
  stats?: ConversionStats;
}

/**
 * 输出数据
 */
export interface OutputData {
  /** 文件映射：路径 -> 内容 */
  files: Map<string, string | Uint8Array>;
}

// ============================================================================
// 错误定义
// ============================================================================

/**
 * 错误码
 */
export enum ErrorCode {
  /** 卡片文件不存在 */
  CARD_NOT_FOUND = 'CONV-HTML-001',
  /** 卡片格式无效 */
  INVALID_FORMAT = 'CONV-HTML-002',
  /** metadata.yaml 错误 */
  METADATA_ERROR = 'CONV-HTML-003',
  /** structure.yaml 错误 */
  STRUCTURE_ERROR = 'CONV-HTML-004',
  /** 基础卡片配置缺失 */
  BASE_CARD_MISSING = 'CONV-HTML-005',
  /** 渲染插件不存在 */
  RENDERER_NOT_FOUND = 'CONV-HTML-006',
  /** 渲染失败 */
  RENDER_FAILED = 'CONV-HTML-007',
  /** 主题不存在 */
  THEME_NOT_FOUND = 'CONV-HTML-008',
  /** 资源文件缺失 */
  RESOURCE_MISSING = 'CONV-HTML-009',
  /** 资源处理失败 */
  RESOURCE_ERROR = 'CONV-HTML-010',
  /** 输出目录创建失败 */
  OUTPUT_DIR_ERROR = 'CONV-HTML-011',
  /** 文件写入失败 */
  WRITE_ERROR = 'CONV-HTML-012',
  /** 转换被取消 */
  CANCELLED = 'CONV-HTML-013',
}

/**
 * 转换错误
 */
export interface ConversionError {
  /** 错误码 */
  code: ErrorCode;
  /** 错误消息 */
  message: string;
  /** 相关文件路径 */
  filePath?: string;
  /** 相关卡片 ID */
  cardId?: string;
  /** 原始错误 */
  cause?: Error;
}

// ============================================================================
// 转换源
// ============================================================================

/**
 * 转换源类型
 */
export type ConversionSourceType = 'path' | 'data';

/**
 * 转换源
 */
export interface ConversionSource {
  /** 源类型 */
  type: ConversionSourceType;
  /** 文件路径（type 为 path 时） */
  path?: string;
  /** 卡片数据（type 为 data 时） */
  data?: Uint8Array;
  /** 文件类型 */
  fileType: 'card';
}

// ============================================================================
// 插件接口
// ============================================================================

/**
 * 转换器插件接口
 */
export interface ConverterPlugin {
  /** 插件 ID */
  id: string;
  /** 插件名称 */
  name: string;
  /** 插件版本 */
  version: string;
  /** 支持的源文件类型 */
  sourceTypes: string[];
  /** 目标文件类型 */
  targetType: string;
  /** 插件描述 */
  description?: string;

  /**
   * 执行转换
   */
  convert(source: ConversionSource, options?: ConversionOptions): Promise<ConversionResult>;

  /**
   * 获取默认选项
   */
  getDefaultOptions(): ConversionOptions;

  /**
   * 验证选项
   */
  validateOptions(options: ConversionOptions): ValidationResult;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误列表 */
  errors?: string[];
  /** 警告列表 */
  warnings?: string[];
}

// ============================================================================
// 内部模块类型
// ============================================================================

/**
 * HTML 文件映射
 */
export type HTMLFileMap = Map<string, string>;

/**
 * 资源文件映射
 */
export type ResourceFileMap = Map<string, Uint8Array>;

/**
 * 处理后的资源
 */
export interface ProcessedResource {
  /** 原始路径 */
  originalPath: string;
  /** 输出路径 */
  outputPath: string;
  /** 资源内容 */
  content: Uint8Array;
  /** 资源类型 */
  type: ResourceType;
}
