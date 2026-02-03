/**
 * OutputWriter - 输出模块
 *
 * 负责将生成的文件写入文件系统或打包为数据结构
 */

import type { HTMLFileMap, ResourceFileMap, OutputData } from '../types';

/**
 * 写入结果
 */
export interface WriteResult {
  /** 是否成功 */
  success: boolean;
  /** 输出路径（写入文件系统时） */
  outputPath?: string;
  /** 输出数据（返回数据时） */
  data?: OutputData;
  /** 错误信息 */
  error?: string;
  /** 写入的文件数量 */
  fileCount?: number;
  /** 总大小（字节） */
  totalSize?: number;
}

/**
 * 输出写入器
 */
export class OutputWriter {
  /**
   * 写入文件
   *
   * @param htmlFiles - HTML 文件映射
   * @param themeCss - 主题 CSS 内容
   * @param resourceFiles - 资源文件映射
   * @param outputPath - 输出路径（可选）
   * @returns 写入结果
   */
  async write(
    htmlFiles: HTMLFileMap,
    themeCss: string,
    resourceFiles: ResourceFileMap,
    outputPath?: string
  ): Promise<WriteResult> {
    try {
      // 合并所有文件
      const allFiles = new Map<string, string | Uint8Array>();

      // 添加 HTML 文件
      for (const [path, content] of htmlFiles) {
        allFiles.set(path, content);
      }

      // 添加主题文件
      allFiles.set('theme.css', themeCss);

      // 添加资源文件
      for (const [path, content] of resourceFiles) {
        allFiles.set(path, content);
      }

      // 计算统计
      let totalSize = 0;
      for (const content of allFiles.values()) {
        totalSize += typeof content === 'string'
          ? new TextEncoder().encode(content).length
          : content.length;
      }

      if (outputPath) {
        // 写入文件系统
        await this._writeToFileSystem(allFiles, outputPath);

        return {
          success: true,
          outputPath,
          fileCount: allFiles.size,
          totalSize,
        };
      } else {
        // 返回数据
        return {
          success: true,
          data: { files: allFiles },
          fileCount: allFiles.size,
          totalSize,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '写入失败',
      };
    }
  }

  /**
   * 转换为数据结构
   *
   * @param htmlFiles - HTML 文件映射
   * @param themeCss - 主题 CSS 内容
   * @param resourceFiles - 资源文件映射
   * @returns 输出数据
   */
  toData(
    htmlFiles: HTMLFileMap,
    themeCss: string,
    resourceFiles: ResourceFileMap
  ): OutputData {
    const files = new Map<string, string | Uint8Array>();

    for (const [path, content] of htmlFiles) {
      files.set(path, content);
    }

    files.set('theme.css', themeCss);

    for (const [path, content] of resourceFiles) {
      files.set(path, content);
    }

    return { files };
  }

  /**
   * 写入文件系统
   *
   * @param files - 文件映射
   * @param outputPath - 输出目录路径
   */
  private async _writeToFileSystem(
    files: Map<string, string | Uint8Array>,
    outputPath: string
  ): Promise<void> {
    // TODO: 调用 Node.js fs 或 SDK 的 FileAPI 写入文件
    // 目前抛出错误，需要在实际环境中实现

    // 检查是否在 Node.js 环境
    if (typeof process !== 'undefined' && process.versions?.node) {
      // Node.js 环境
      const fs = await import('fs');
      const path = await import('path');

      // 创建输出目录
      await fs.promises.mkdir(outputPath, { recursive: true });

      // 写入每个文件
      for (const [filePath, content] of files) {
        const fullPath = path.join(outputPath, filePath);
        const dir = path.dirname(fullPath);

        // 确保目录存在
        await fs.promises.mkdir(dir, { recursive: true });

        // 写入文件
        if (typeof content === 'string') {
          await fs.promises.writeFile(fullPath, content, 'utf-8');
        } else {
          await fs.promises.writeFile(fullPath, content);
        }
      }
    } else {
      // 浏览器环境，返回数据而不是写入文件
      throw new Error('文件写入需要 Node.js 环境');
    }
  }

  /**
   * 创建目录结构描述
   *
   * @param files - 文件映射
   * @returns 目录结构字符串
   */
  describeStructure(files: Map<string, string | Uint8Array>): string {
    const paths = Array.from(files.keys()).sort();
    const lines: string[] = [];

    for (const path of paths) {
      const depth = path.split('/').length - 1;
      const indent = '  '.repeat(depth);
      const filename = path.split('/').pop() ?? path;
      const content = files.get(path);
      const size = typeof content === 'string'
        ? new TextEncoder().encode(content).length
        : content?.length ?? 0;

      lines.push(`${indent}├── ${filename} (${this._formatSize(size)})`);
    }

    return lines.join('\n');
  }

  /**
   * 格式化文件大小
   */
  private _formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

/**
 * 创建写入器实例
 */
export function createOutputWriter(): OutputWriter {
  return new OutputWriter();
}

/**
 * 默认写入器实例
 */
export const outputWriter = createOutputWriter();
