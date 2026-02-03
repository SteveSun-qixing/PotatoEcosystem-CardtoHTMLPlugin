# CardtoHTMLPlugin

薯片生态卡片转 HTML 插件

## 简介

CardtoHTMLPlugin 是薯片生态文件转换系统的核心插件之一，负责将卡片文件（.card）转换为完整的 HTML 网页。转换后的网页支持离线浏览，完整还原卡片的层级结构和视觉效果。

## 功能特性

- 将卡片文件转换为可离线浏览的 HTML 网页
- 使用 iframe 嵌套还原卡片层级结构
- 自动提取和应用主题样式
- 复制资源文件到输出目录
- 支持配置输出选项

## 安装

```bash
npm install @chips/cardto-html-plugin
```

## 使用方式

插件通过薯片 SDK 的转换 API 调用，无需直接实例化。

## 输出结构

```
output/
├── index.html              # 主入口文件
├── cards/
│   ├── {card-id-1}.html   # 基础卡片的 HTML
│   ├── {card-id-2}.html
│   └── ...
├── assets/
│   ├── images/            # 图片资源
│   ├── videos/            # 视频资源
│   └── styles/            # 样式文件
└── theme.css              # 主题样式
```

## 依赖

- @chips/sdk
- @chips/foundation

## 许可证

MIT License

## 仓库

https://github.com/SteveSun-qixing/PotatoEcosystem-CardtoHTMLPlugin
