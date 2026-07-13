# Ollama 本地认证绕过 + 项目级 models.json

## 提交

`7ceef5f` — feat(coding-agent): Ollama localhost auth bypass + project-level .pi/models.json

## 概述

两个独立功能：(1) 本地模型服务（Ollama/vLLM/llama.cpp）自动跳过 API Key 认证；(2) 项目级 `.pi/models.json` 配置，覆盖全局 `~/.pi/agent/models.json`。

## 功能一：本地 URL 自动跳过认证

### 修改文件

`model-registry.ts`

### 原理

新增 `isLocalUrl()` 函数检测 baseUrl 是否为本地地址：

```typescript
export function isLocalUrl(url: string): boolean {
    try {
        const { hostname } = new URL(url);
        return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
    } catch {
        return false;
    }
}
```

三个集成点：

| 位置 | 作用 |
|------|------|
| `hasConfiguredAuth()` | 本地模型直接返回 `true`（无需 API Key） |
| `getConfiguredAuth()` | 本地模型返回 `"unused"` 占位符 |
| SDK 认证检查 | 本地 URL 跳过 API Key 弹窗 |

### 效果

```
.pi/models.json 配置 Ollama/vLLM/llama.cpp 等本地服务时，无需设置 API Key。
```

## 功能二：项目级 .pi/models.json

### 修改文件

`model-registry.ts`, `sdk.ts`, `agent-session-services.ts`

### 原理

两级配置加载：

```
全局: ~/.pi/agent/models.json          (系统级，所有项目共用)
项目: <project>/.pi/models.json         (项目级，覆盖全局)
```

加载顺序：
1. 加载全局 `models.json`
2. 加载项目 `.pi/models.json`
3. 项目级 overrides 覆盖全局
4. 项目级自定义模型追加到末尾

### 配置格式

`.pi/models.json`:

```json
{
    "providers": {
        "llama": {
            "baseUrl": "http://localhost:18080/v1",
            "api": "openai-completions",
            "models": [
                {
                    "id": "gemma-4-12B-it-heretic-QAT-UD",
                    "name": "gemma-4-12B-it-heretic-QAT-UD",
                    "contextWindow": 65536,
                    "maxTokens": 4096,
                    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
                }
            ]
        }
    }
}
```

支持字段：`providers.<name>.baseUrl`, `api`, `apiKey`, `headers`, `models[]`, `modelsOverrides[]`

### 效果

```
项目根目录放置 .pi/models.json 即可添加本地模型/覆盖全局配置，无需修改 ~/.pi/agent/models.json。
```

## 修改列表

| 文件 | 修改 |
|------|------|
| `model-registry.ts` | 新增 `isLocalUrl()`, 项目级 models.json 加载, hasConfiguredAuth 本地地址跳过 |
| `agent-session-services.ts` | 增加项目级 models.json 路径参数 |
| `sdk.ts` | 移除多余的 API Key 弹窗判断 |
| `.pi/models.json` | 新增项目级本地模型配置 |
| `.pi/settings.json` | 新增 settings 文件 |
