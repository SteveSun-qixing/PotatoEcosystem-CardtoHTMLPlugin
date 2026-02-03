/**
 * CardtoHTMLPlugin 主类
 *
 * 实现 ConverterPlugin 接口，提供卡片转 HTML 的转换能力
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ConverterPlugin,
  ConversionSource,
  ConversionOptions,
  ConversionResult,
  ConversionError,
  ValidationResult,
  ProgressInfo,
  ConversionStatus,
  ErrorCode,
} from './types';

// 导入各处理模块
import { CardParser } from './parser/card-parser';
import { RendererFetcher } from './renderer/renderer-fetcher';
import { HTMLGenerator } from './generator/html-generator';
import { ThemeProcessor } from './theme/theme-processor';
import { ResourceHandler } from './resource/resource-handler';
import { OutputWriter } from './output/output-writer';

/**
 * 插件元数据
 */
const PLUGIN_METADATA = {
  id: 'cardto-html-plugin',
  name: '卡片转 HTML 插件',
  version: '0.1.0',
  sourceTypes: ['.card', 'card'],
  targetType: 'html-directory',
  description: '将薯片卡片文件转换为可离线浏览的 HTML 网页',
};

/**
 * 默认转换选项
 */
const DEFAULT_OPTIONS: ConversionOptions = {
  includeAssets: true,
  assetStrategy: 'copy-local',
  parallelCount: 4,
};

/**
 * CardtoHTMLPlugin 转换器插件
 */
export class CardtoHTMLPlugin implements ConverterPlugin {
  /** 插件 ID */
  readonly id = PLUGIN_METADATA.id;

  /** 插件名称 */
  readonly name = PLUGIN_METADATA.name;

  /** 插件版本 */
  readonly version = PLUGIN_METADATA.version;

  /** 支持的源文件类型 */
  readonly sourceTypes = PLUGIN_METADATA.sourceTypes;

  /** 目标文件类型 */
  readonly targetType = PLUGIN_METADATA.targetType;

  /** 插件描述 */
  readonly description = PLUGIN_METADATA.description;

  /** 活动任务映射 */
  private _activeTasks: Map<string, { cancelled: boolean }> = new Map();

  /** 卡片解析器 */
  private _parser: CardParser;

  /** 渲染代码获取器 */
  private _rendererFetcher: RendererFetcher;

  /** HTML 生成器 */
  private _htmlGenerator: HTMLGenerator;

  /** 主题处理器 */
  private _themeProcessor: ThemeProcessor;

  /** 资源处理器 */
  private _resourceHandler: ResourceHandler;

  /** 输出写入器 */
  private _outputWriter: OutputWriter;

  constructor() {
    this._parser = new CardParser();
    this._rendererFetcher = new RendererFetcher();
    this._htmlGenerator = new HTMLGenerator();
    this._themeProcessor = new ThemeProcessor();
    this._resourceHandler = new ResourceHandler();
    this._outputWriter = new OutputWriter();
  }

  /**
   * 执行转换
   *
   * @param source - 转换源（卡片文件路径或数据）
   * @param options - 转换选项
   * @returns 转换结果
   */
  async convert(
    source: ConversionSource,
    options?: ConversionOptions
  ): Promise<ConversionResult> {
    const taskId = uuidv4();
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();
    const warnings: string[] = [];

    // 注册任务
    this._activeTasks.set(taskId, { cancelled: false });

    // 进度报告辅助函数
    const reportProgress = (status: ConversionStatus, percent: number, step?: string): void => {
      if (mergedOptions.onProgress) {
        const progress: ProgressInfo = {
          taskId,
          status,
          percent,
          currentStep: step,
        };
        mergedOptions.onProgress(progress);
      }
    };

    try {
      // 检查任务是否被取消
      const checkCancelled = (): boolean => {
        const task = this._activeTasks.get(taskId);
        return task?.cancelled ?? false;
      };

      // 1. 解析阶段
      reportProgress('parsing', 0, '正在解析卡片文件');

      if (checkCancelled()) {
        return this._createCancelledResult(taskId);
      }

      const parseResult = await this._parser.parse(source);
      if (!parseResult.success || !parseResult.data) {
        return {
          success: false,
          taskId,
          error: parseResult.error ?? {
            code: 'CONV-HTML-002' as ErrorCode,
            message: '卡片解析失败',
          },
          warnings: parseResult.warnings,
        };
      }
      const cardData = parseResult.data;
      if (parseResult.warnings) {
        warnings.push(...parseResult.warnings);
      }
      reportProgress('parsing', 20, '卡片解析完成');

      // 2. 获取渲染代码
      reportProgress('rendering', 20, '正在获取渲染代码');

      if (checkCancelled()) {
        return this._createCancelledResult(taskId);
      }

      const cardTypes = [...new Set(cardData.baseCards.map(c => c.type))];
      const renderers = await this._rendererFetcher.fetchRenderers(cardTypes);
      reportProgress('rendering', 40, '渲染代码获取完成');

      // 3. 生成 HTML
      reportProgress('rendering', 40, '正在生成 HTML');

      if (checkCancelled()) {
        return this._createCancelledResult(taskId);
      }

      const generateResult = await this._htmlGenerator.generate(cardData, renderers);
      if (!generateResult.success || !generateResult.files) {
        return {
          success: false,
          taskId,
          error: {
            code: 'CONV-HTML-007' as ErrorCode,
            message: generateResult.error ?? 'HTML 生成失败',
          },
          warnings: generateResult.warnings,
        };
      }
      let htmlFiles = generateResult.files;
      if (generateResult.warnings) {
        warnings.push(...generateResult.warnings);
      }
      reportProgress('rendering', 60, 'HTML 生成完成');

      // 4. 处理主题
      reportProgress('processing', 60, '正在处理主题');

      if (checkCancelled()) {
        return this._createCancelledResult(taskId);
      }

      const themeId = mergedOptions.themeId ?? cardData.metadata.themeId;
      const themeResult = await this._themeProcessor.process(themeId, htmlFiles);
      if (!themeResult.success || !themeResult.htmlFiles || !themeResult.themeCss) {
        return {
          success: false,
          taskId,
          error: {
            code: 'CONV-HTML-008' as ErrorCode,
            message: themeResult.error ?? '主题处理失败',
          },
          warnings,
        };
      }
      htmlFiles = themeResult.htmlFiles;
      const themeCss = themeResult.themeCss;
      reportProgress('processing', 70, '主题处理完成');

      // 5. 处理资源
      reportProgress('processing', 70, '正在处理资源文件');

      if (checkCancelled()) {
        return this._createCancelledResult(taskId);
      }

      let resourceFiles = new Map<string, Uint8Array>();
      if (mergedOptions.includeAssets !== false) {
        this._resourceHandler = new ResourceHandler({
          strategy: mergedOptions.assetStrategy,
        });
        const resourceResult = await this._resourceHandler.handle(
          htmlFiles,
          cardData.resources,
          cardData.rawFiles
        );
        if (resourceResult.htmlFiles) {
          htmlFiles = resourceResult.htmlFiles;
        }
        if (resourceResult.resourceFiles) {
          resourceFiles = resourceResult.resourceFiles;
        }
        if (resourceResult.warnings) {
          warnings.push(...resourceResult.warnings);
        }
      }
      reportProgress('processing', 90, '资源处理完成');

      // 6. 输出
      reportProgress('writing', 90, '正在写入输出');

      if (checkCancelled()) {
        return this._createCancelledResult(taskId);
      }

      const writeResult = await this._outputWriter.write(
        htmlFiles,
        themeCss,
        resourceFiles,
        mergedOptions.outputPath
      );
      reportProgress('completed', 100, '转换完成');

      const duration = Date.now() - startTime;

      if (!writeResult.success) {
        return {
          success: false,
          taskId,
          error: {
            code: 'CONV-HTML-012' as ErrorCode,
            message: writeResult.error ?? '写入失败',
          },
          warnings,
        };
      }

      return {
        success: true,
        taskId,
        outputPath: writeResult.outputPath,
        data: writeResult.data,
        warnings: warnings.length > 0 ? warnings : undefined,
        stats: {
          duration,
          inputSize: 0, // 需要从解析阶段获取
          outputSize: writeResult.totalSize ?? 0,
          baseCardCount: cardData.baseCards.length,
          resourceCount: resourceFiles.size,
        },
      };
    } catch (error) {
      reportProgress('failed', 0, '转换失败');

      const conversionError: ConversionError = {
        code: 'CONV-HTML-002' as ErrorCode,
        message: error instanceof Error ? error.message : '未知错误',
        cause: error instanceof Error ? error : undefined,
      };

      return {
        success: false,
        taskId,
        error: conversionError,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } finally {
      // 清理任务
      this._activeTasks.delete(taskId);
    }
  }

  /**
   * 获取默认选项
   */
  getDefaultOptions(): ConversionOptions {
    return { ...DEFAULT_OPTIONS };
  }

  /**
   * 验证选项
   */
  validateOptions(options: ConversionOptions): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证 assetStrategy
    const validStrategies = ['copy-all', 'copy-local', 'embed', 'reference-only'];
    if (options.assetStrategy && !validStrategies.includes(options.assetStrategy)) {
      errors.push(`无效的资源处理策略: ${options.assetStrategy}`);
    }

    // 验证 parallelCount
    if (options.parallelCount !== undefined) {
      if (options.parallelCount < 1) {
        errors.push('parallelCount 必须大于 0');
      } else if (options.parallelCount > 16) {
        warnings.push('parallelCount 过大可能影响性能，建议不超过 16');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * 取消转换任务
   *
   * @param taskId - 任务 ID
   */
  cancelTask(taskId: string): boolean {
    const task = this._activeTasks.get(taskId);
    if (task) {
      task.cancelled = true;
      return true;
    }
    return false;
  }

  /**
   * 创建已取消的结果
   */
  private _createCancelledResult(taskId: string): ConversionResult {
    return {
      success: false,
      taskId,
      error: {
        code: 'CONV-HTML-013' as ErrorCode,
        message: '转换已取消',
      },
    };
  }
}

/**
 * 创建插件实例
 */
export function createPlugin(): CardtoHTMLPlugin {
  return new CardtoHTMLPlugin();
}

/**
 * 默认插件实例
 */
export const plugin = createPlugin();
