/**
 * 转换外观配置中心
 *
 * 负责统一管理 HTML / PDF / 图片三种导出形态的视觉参数，
 * 并为各转换模块提供一致的默认配置与覆盖能力。
 */

/**
 * 深度可选类型
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown>
    ? DeepPartial<T[K]>
    : T[K];
};

/**
 * 页面布局外观参数
 */
export interface ConversionLayoutAppearance {
  pageBackgroundColor: string;
  cardWidthPx: number;
  pagePaddingXpx: number;
  pagePaddingYpx: number;
  pagePaddingBottomExtraPx: number;
  mobilePaddingXpx: number;
  mobilePaddingYpx: number;
}

/**
 * 图片渲染外观参数
 */
export interface ConversionImageAppearance {
  viewportWidthPx: number;
  viewportHeightPx: number;
  deviceScaleFactor: number;
  waitTimeMs: number;
}

/**
 * PDF 渲染外观参数
 */
export interface ConversionPDFAppearance {
  pageFormat: 'a4' | 'a5' | 'a3' | 'letter' | 'legal' | 'tabloid';
  orientation: 'portrait' | 'landscape';
  margin: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  printBackground: boolean;
  viewportWidthPx: number;
  viewportHeightPx: number;
}

/**
 * 三类转换共享外观配置
 */
export interface ConversionAppearanceProfile {
  id: string;
  description: string;
  layout: ConversionLayoutAppearance;
  image: ConversionImageAppearance;
  pdf: ConversionPDFAppearance;
}

/**
 * 外观配置解析输入
 */
export interface ResolveAppearanceInput {
  profileId?: string;
  overrides?: DeepPartial<Omit<ConversionAppearanceProfile, 'id' | 'description'>>;
}

export const DEFAULT_CONVERSION_APPEARANCE_PROFILE_ID = 'default-balanced-v1';

const DEFAULT_PROFILE: ConversionAppearanceProfile = {
  id: DEFAULT_CONVERSION_APPEARANCE_PROFILE_ID,
  description: '默认平衡导出风格：统一宽度、淡灰背景、可读性优先',
  layout: {
    pageBackgroundColor: '#eef1f5',
    cardWidthPx: 740,
    pagePaddingXpx: 24,
    pagePaddingYpx: 20,
    pagePaddingBottomExtraPx: 16,
    mobilePaddingXpx: 12,
    mobilePaddingYpx: 12,
  },
  image: {
    viewportWidthPx: 794,
    viewportHeightPx: 1123,
    deviceScaleFactor: 2,
    waitTimeMs: 1000,
  },
  pdf: {
    pageFormat: 'a4',
    orientation: 'portrait',
    margin: {
      top: '0mm',
      right: '0mm',
      bottom: '0mm',
      left: '0mm',
    },
    printBackground: true,
    viewportWidthPx: 794,
    viewportHeightPx: 1123,
  },
};

const PROFILE_TABLE: Record<string, ConversionAppearanceProfile> = {
  [DEFAULT_CONVERSION_APPEARANCE_PROFILE_ID]: DEFAULT_PROFILE,
  default: DEFAULT_PROFILE,
};

/**
 * 获取可用外观配置表（只读副本）
 */
export function getConversionAppearanceProfiles(): Record<string, ConversionAppearanceProfile> {
  const clonedProfiles: Record<string, ConversionAppearanceProfile> = {};
  for (const [profileId, profile] of Object.entries(PROFILE_TABLE)) {
    clonedProfiles[profileId] = deepClone(profile);
  }
  return clonedProfiles;
}

/**
 * 解析外观配置（默认配置 + 指定 profile + 局部覆盖）
 */
export function resolveConversionAppearance(
  input?: ResolveAppearanceInput
): ConversionAppearanceProfile {
  const profileId = input?.profileId ?? DEFAULT_CONVERSION_APPEARANCE_PROFILE_ID;
  const baseProfile = PROFILE_TABLE[profileId] ?? DEFAULT_PROFILE;
  const merged = deepMerge(
    deepClone(baseProfile),
    input?.overrides ?? {}
  ) as ConversionAppearanceProfile;

  // 数值参数基础校验，防止异常配置导致导出不可用
  merged.layout.cardWidthPx = positiveNumberOrFallback(merged.layout.cardWidthPx, baseProfile.layout.cardWidthPx);
  merged.layout.pagePaddingXpx = nonNegativeNumberOrFallback(merged.layout.pagePaddingXpx, baseProfile.layout.pagePaddingXpx);
  merged.layout.pagePaddingYpx = nonNegativeNumberOrFallback(merged.layout.pagePaddingYpx, baseProfile.layout.pagePaddingYpx);
  merged.layout.pagePaddingBottomExtraPx = nonNegativeNumberOrFallback(
    merged.layout.pagePaddingBottomExtraPx,
    baseProfile.layout.pagePaddingBottomExtraPx
  );
  merged.layout.mobilePaddingXpx = nonNegativeNumberOrFallback(merged.layout.mobilePaddingXpx, baseProfile.layout.mobilePaddingXpx);
  merged.layout.mobilePaddingYpx = nonNegativeNumberOrFallback(merged.layout.mobilePaddingYpx, baseProfile.layout.mobilePaddingYpx);

  merged.image.viewportWidthPx = positiveNumberOrFallback(merged.image.viewportWidthPx, baseProfile.image.viewportWidthPx);
  merged.image.viewportHeightPx = positiveNumberOrFallback(merged.image.viewportHeightPx, baseProfile.image.viewportHeightPx);
  merged.image.deviceScaleFactor = positiveNumberOrFallback(merged.image.deviceScaleFactor, baseProfile.image.deviceScaleFactor);
  merged.image.waitTimeMs = nonNegativeNumberOrFallback(merged.image.waitTimeMs, baseProfile.image.waitTimeMs);

  merged.pdf.viewportWidthPx = positiveNumberOrFallback(merged.pdf.viewportWidthPx, baseProfile.pdf.viewportWidthPx);
  merged.pdf.viewportHeightPx = positiveNumberOrFallback(merged.pdf.viewportHeightPx, baseProfile.pdf.viewportHeightPx);

  merged.id = baseProfile.id;
  merged.description = baseProfile.description;
  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T>(base: T, overrides: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return (overrides ?? base) as T;
  }

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const current = result[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      result[key] = deepMerge(current, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  return result as T;
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }
  if (isPlainObject(value)) {
    const cloned: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      cloned[key] = deepClone(item);
    }
    return cloned as T;
  }
  return value;
}

function positiveNumberOrFallback(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeNumberOrFallback(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
