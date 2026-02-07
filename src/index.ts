/**
 * CardtoHTMLPlugin - 薯片卡片转 HTML 插件
 *
 * 将薯片卡片文件（.card）转换为可离线浏览的完整 HTML 网页
 *
 * @packageDocumentation
 */

// 导出插件主类和工厂函数
export { CardtoHTMLPlugin, createPlugin, plugin } from './plugin';

// 导出各处理模块
export { CardParser, createParser, parser } from './parser';
export { RendererFetcher, createRendererFetcher, rendererFetcher } from './renderer';
export { HTMLGenerator, createHTMLGenerator, htmlGenerator } from './generator';
export { ThemeProcessor, createThemeProcessor, themeProcessor } from './theme';
export { ResourceHandler, createResourceHandler, resourceHandler } from './resource';
export { OutputWriter, createOutputWriter, outputWriter } from './output';
export {
  DEFAULT_CONVERSION_APPEARANCE_PROFILE_ID,
  getConversionAppearanceProfiles,
  resolveConversionAppearance,
} from './appearance';

// 导出模块类型
export type { ParseResult, CardParserOptions } from './parser';
export type { RendererFetcherOptions } from './renderer';
export type { HTMLGeneratorOptions, GenerateResult } from './generator';
export type { ThemeDefinition, ThemeProcessResult } from './theme';
export type { ResourceHandleResult, ResourceHandlerOptions } from './resource';
export type { WriteResult } from './output';
export type {
  DeepPartial,
  ConversionLayoutAppearance,
  ConversionImageAppearance,
  ConversionPDFAppearance,
  ConversionAppearanceProfile,
  ResolveAppearanceInput,
} from './appearance';

// 导出所有类型定义
export type {
  // 卡片数据结构
  CardMetadata,
  CardStructure,
  BaseCardConfig,
  ResourceReference,
  ResourceType,
  CardData,
  // 渲染代码
  RendererCode,
  RendererCodeMap,
  // 转换选项和结果
  AssetStrategy,
  ConversionOptions,
  ConversionStatus,
  ProgressInfo,
  ConversionStats,
  ConversionResult,
  OutputData,
  // 错误
  ConversionError,
  // 转换源
  ConversionSourceType,
  ConversionSource,
  // 插件接口
  ConverterPlugin,
  ValidationResult,
  // 内部类型
  HTMLFileMap,
  ResourceFileMap,
  ProcessedResource,
} from './types';

// 导出错误码枚举
export { ErrorCode } from './types';
