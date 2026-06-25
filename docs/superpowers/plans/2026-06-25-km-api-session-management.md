# KM-API 会话复用优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 KM-API /llm/translate 接口添加会话复用功能，按 kb_id 隔离会话，超时时间设为 1 小时。

**Architecture:** 在 KM-API 服务端维护一个 Map<kb_id, {conversationId, lastUsed}> 会话管理器。九问 API 调用时传递 conversation_id 实现上下文复用。km-operation-builder 的 name_translator.py 通过 TranslateSession 类管理会话生命周期。

**Tech Stack:** TypeScript (KM-API), Python (km-operation-builder)

---

## 文件结构

```
KM-API/
├── src/server.ts                          # 修改 /llm/translate 接口，添加会话管理器
└── dist/server.js                         # 编译产物

km-operation-builder/
├── scripts/
│   ├── name_translator.py                 # 新增 TranslateSession 类
│   └── builder_entry.py                   # 修改 builder_translate_name 签名
└── SKILL.md                               # 更新文档
```

---

## Task 1: KM-API 会话管理器实现

**Files:**
- Modify: `D:\Users\11033406\【01】Projects\KM-API\src\server.ts:1-50` (添加类型和会话管理器)
- Modify: `D:\Users\11033406\【01】Projects\KM-API\src\server.ts:646-717` (修改 /llm/translate 接口)

- [ ] **Step 1: 添加会话管理器类型定义和全局变量**

在 `src/server.ts` 第 50 行后添加：

```typescript
interface TranslateSession {
  conversationId: string | null;
  lastUsed: number;
}

const translateSessions = new Map<string, TranslateSession>();
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1小时

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [kbId, session] of translateSessions.entries()) {
    if (now - session.lastUsed > SESSION_TIMEOUT_MS) {
      translateSessions.delete(kbId);
    }
  }
}

setInterval(cleanupExpiredSessions, 60 * 1000);
```

- [ ] **Step 2: 修改 /llm/translate 接口**

将 `src/server.ts` 第 646-717 行的 `/llm/translate` 接口替换为：

```typescript
app.post('/api/llm/translate', async (req, res) => {
  const { prompt, kb_id, conversation_id } = req.body;

  if (!prompt) {
    res.json({ success: false, error: 'prompt is required' });
    return;
  }

  const systemPrompt = `你是一个专业的翻译专家，负责将中文翻译为英文。请遵循以下规则：
1. 只返回翻译结果，不要添加任何解释或额外内容
2. 翻译要简洁、专业、符合技术文档风格
3. 使用小写字母和连字符（kebab-case）格式
4. 如果是Skill名称，返回JSON格式：{"candidates": ["xxx-xxx-xxx"]}
5. 如果是多个候选名称，返回多个选项`;

  const timeoutMs = 35000;

  try {
    const kbIdKey = String(kb_id || 'default');
    let session = translateSessions.get(kbIdKey);
    if (!session) {
      session = { conversationId: null, lastUsed: Date.now() };
      translateSessions.set(kbIdKey, session);
    }

    let query = `${systemPrompt}\n\n${prompt}`;
    let userParam = kb_id ? String(kb_id) : 'km-api';
    let convIdParam: string | undefined = conversation_id || session.conversationId || undefined;

    const requestBody: any = {
      query: query,
      inputs: {},
      response_mode: 'blocking',
      user: userParam,
    };
    if (convIdParam) {
      requestBody.conversation_id = convIdParam;
    }

    console.log('[DEBUG] 九问 API 请求:', LLM_API_URL);
    console.log('[DEBUG] 请求体:', JSON.stringify(requestBody));

    const { stdout, stderr } = await execFileAsync('curl', [
      '-s',
      '-X', 'POST',
      LLM_API_URL,
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${LLM_API_KEY}`,
      '-d', JSON.stringify(requestBody),
      '--max-time', '30',
    ], { timeout: timeoutMs });

    if (stderr) {
      console.log('[DEBUG] curl stderr:', stderr);
    }

    let data: any;
    try {
      data = JSON.parse(stdout);
    } catch {
      console.log('[DEBUG] curl 返回非 JSON:', stdout);
      res.json({ success: false, error: 'Invalid response from upstream API', raw: stdout });
      return;
    }

    console.log('[DEBUG] 九问 API 响应:', JSON.stringify(data));

    if (data.code && data.code !== 200 && data.code !== 0) {
      res.json({ success: false, error: `API error: ${data.message || data.msg || 'Unknown'}`, details: data });
      return;
    }

    if (data.error) {
      res.json({ success: false, error: data.error });
      return;
    }

    const content = data.answer || data.data?.answer || '';
    const respConversationId = data.conversation_id || data.data?.conversation_id;

    if (respConversationId) {
      session.conversationId = respConversationId;
      session.lastUsed = Date.now();
    }

    res.json({ success: true, data: { content, conversation_id: respConversationId } });
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.log('[DEBUG] 九问 API 异常:', errorMessage);
    res.json({ success: false, error: errorMessage });
  }
});
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd "D:\Users\11033406\【01】Projects\KM-API" && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 4: 提交代码**

```bash
cd "D:\Users\11033406\【01】Projects\KM-API"
git add src/server.ts
git commit -m "feat: 添加会话复用管理器，超时1小时"
git push origin master
```

---

## Task 2: km-operation-builder TranslateSession 类

**Files:**
- Modify: `D:\Users\11033406\【03】Workspace\【02】内容知识库专项\km-operation-builder\scripts\name_translator.py`

- [ ] **Step 1: 添加 TranslateSession 类**

在 `name_translator.py` 第 19 行后添加：

```python
class TranslateSession:
    """翻译会话管理（按 kb_id 隔离）"""

    _sessions: Dict[int, 'TranslateSession'] = {}

    def __init__(self, kb_id: int, km_api_url: str = KM_API_URL):
        self.kb_id = kb_id
        self.km_api_url = km_api_url
        self.conversation_id: Optional[str] = None

    @classmethod
    def get_session(cls, kb_id: int, km_api_url: str = KM_API_URL) -> 'TranslateSession':
        if kb_id not in cls._sessions:
            cls._sessions[kb_id] = TranslateSession(kb_id, km_api_url)
        return cls._sessions[kb_id]

    def translate(self, prompt: str) -> Dict[str, Any]:
        """执行翻译请求"""
        import urllib.request

        payload: Dict[str, Any] = {"prompt": prompt, "kb_id": self.kb_id}
        if self.conversation_id:
            payload["conversation_id"] = self.conversation_id

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.km_api_url + "/llm/translate",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))

            if result.get("success") and result.get("data", {}).get("conversation_id"):
                self.conversation_id = result["data"]["conversation_id"]

            return result
        except Exception as e:
            return {"success": False, "error": str(e)}

    def close(self):
        """关闭会话"""
        self.conversation_id = None
```

- [ ] **Step 2: 修改 translate_kb_name_strict 函数**

将 `translate_kb_name_strict` 函数（第 21-80 行）中的 URL 请求部分替换为使用 TranslateSession：

```python
def translate_kb_name_strict(kb_name: str, kb_id: int = 0) -> Dict[str, Any]:
    """
    强制翻译知识库名称（翻译失败时抛出异常）

    Args:
        kb_name: 知识库名称（中文）
        kb_id: 知识库 ID（可选，用于会话复用）

    Returns:
        {
            success: True,
            name: str  # 翻译后的英文名称
        }

    Raises:
        TranslationError: 翻译失败时抛出
    """
    prompt = f"""你是一个专业的命名助手。请将以下中文知识库名称翻译成英文，用于生成 BlueCode Skill 名称。

要求：
1. 生成 1 个简洁的英文翻译
2. 名称应该体现知识库的核心主题
3. 只返回英文名称，不要解释

知识库名称：{kb_name}

请以 JSON 格式返回：
{{"name": "英文名称"}}
"""

    try:
        if kb_id:
            session = TranslateSession.get_session(kb_id)
            result = session.translate(prompt)
        else:
            import urllib.request
            url = f"{KM_API_URL}/llm/translate"
            data = json.dumps({"prompt": prompt}).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))

        if result.get("success"):
            raw_text = result.get("data", {}).get("content", "")
            name = _parse_strict_name(raw_text)
            if name:
                return {
                    "success": True,
                    "name": name
                }

        raise TranslationError(f"翻译接口返回异常或未返回有效结果")

    except TranslationError:
        raise
    except Exception as e:
        raise TranslationError(f"翻译失败: {str(e)}")
```

- [ ] **Step 3: 修改 translate_kb_name 函数**

将 `translate_kb_name` 函数（第 101-170 行）添加 kb_id 参数并使用 TranslateSession：

```python
def translate_kb_name(kb_name: str, count: int = 3, kb_id: int = 0) -> Dict[str, Any]:
    """
    调用大模型翻译知识库名称

    Args:
        kb_name: 知识库名称（中文）
        count: 返回候选数量（默认3）
        kb_id: 知识库 ID（可选，用于会话复用）

    Returns:
        {
            success: True/False,
            candidates: List[str],  # 翻译结果列表
            source: str,            # "api" 或 "fallback"
            error: str              # 失败时返回
        }
    """
    prompt = f"""你是一个专业的命名助手。请将以下中文知识库名称翻译成英文，用于生成 BlueCode Skill 名称。

要求：
1. 生成 {count} 个不同的英文翻译候选
2. 每个名称应该是简洁的英文词组（2-4个单词）
3. 名称应该体现知识库的核心主题
4. 只返回英文名称，不要解释

知识库名称：{kb_name}

请以 JSON 格式返回，格式如下：
{{"candidates": ["名称1", "名称2", "名称3"]}}
"""

    try:
        if kb_id:
            session = TranslateSession.get_session(kb_id)
            result = session.translate(prompt)
        else:
            import urllib.request
            url = f"{KM_API_URL}/llm/translate"
            data = json.dumps({"prompt": prompt}).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))

        if result.get("success"):
            raw_text = result.get("data", {}).get("content", "")
            candidates = _parse_candidates(raw_text)
            if candidates:
                return {
                    "success": True,
                    "candidates": candidates[:count],
                    "source": "api"
                }

        return {
            "success": False,
            "error": result.get("error", "翻译接口返回异常"),
            "candidates": _generate_fallback_names(kb_name, count),
            "source": "fallback"
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "candidates": _generate_fallback_names(kb_name, count),
            "source": "fallback"
        }
```

- [ ] **Step 4: 修改 generate_skill_name_candidates 函数**

将 `generate_skill_name_candidates` 函数（第 173-231 行）添加 kb_id 参数：

```python
def generate_skill_name_candidates(kb_name: str, count: int = 3, kb_id: int = 0) -> Dict[str, Any]:
    """
    生成 Skill 名称候选

    Args:
        kb_name: 知识库名称
        count: 候选数量（默认3）
        kb_id: 知识库 ID（可选，用于会话复用）

    Returns:
        {
            success: True/False,
            candidates: List[str],  # Skill 名称列表
            source: str
        }
    """
    prompt = f"""你是一个 BlueCode Skill 命名专家。请为以下知识库生成 {count} 个英文 Skill 名称候选。

要求：
1. 名称格式：kb-{{英文名}}-operation
2. 英文名使用 kebab-case（连字符分隔）
3. 每个候选应该是独特的
4. 只返回名称列表

知识库名称：{kb_name}

请以 JSON 格式返回：
{{"candidates": ["kb-name1-operation", "kb-name2-operation", "kb-name3-operation"]}}
"""

    try:
        if kb_id:
            session = TranslateSession.get_session(kb_id)
            result = session.translate(prompt)
        else:
            import urllib.request
            url = f"{KM_API_URL}/llm/translate"
            data = json.dumps({"prompt": prompt}).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))

        if result.get("success"):
            raw_text = result.get("data", {}).get("content", "")
            candidates = _parse_candidates(raw_text)
            if candidates:
                normalized = [_normalize_name(c) for c in candidates]
                return {
                    "success": True,
                    "candidates": normalized[:count],
                    "source": "api"
                }

        return _generate_fallback_skill_names(kb_name, count)

    except Exception as e:
        return _generate_fallback_skill_names(kb_name, count)
```

- [ ] **Step 5: 提交代码**

```bash
cd "D:\Users\11033406\【03】Workspace\【02】内容知识库专项\km-operation-builder"
git add scripts/name_translator.py
git commit -m "feat: 添加 TranslateSession 类支持会话复用"
git push origin master
```

---

## Task 3: km-operation-builder builder_entry.py 修改

**Files:**
- Modify: `D:\Users\11033406\【03】Workspace\【02】内容知识库专项\km-operation-builder\scripts\builder_entry.py`

- [ ] **Step 1: 修改 builder_translate_name 函数签名**

将 `builder_entry.py` 第 245-261 行的 `builder_translate_name` 函数修改为：

```python
def builder_translate_name(kb_name: str, count: int = 3, kb_id: int = 0) -> Dict[str, Any]:
    """
    调用大模型翻译知识库名称，生成候选名称

    Args:
        kb_name: 知识库名称（中文）
        count: 返回候选数量（默认3）
        kb_id: 知识库 ID（可选，用于会话复用）

    Returns:
        {
            success: True/False,
            candidates: List[str],
            source: str,
            error: str
        }
    """
    return translate_kb_name(kb_name, count, kb_id)
```

- [ ] **Step 2: 修改 builder_create 中调用 generate_skill_name_candidates 的地方**

将 `builder_entry.py` 第 110 行：
```python
result = generate_skill_name_candidates(real_kb_name, count=1)
```
改为：
```python
result = generate_skill_name_candidates(real_kb_name, count=1, kb_id=kb_id)
```

- [ ] **Step 3: 提交代码**

```bash
cd "D:\Users\11033406\【03】Workspace\【02】内容知识库专项\km-operation-builder"
git add scripts/builder_entry.py
git commit -m "feat: builder_translate_name 支持 kb_id 参数"
git push origin master
```

---

## Task 4: km-operation-builder SKILL.md 更新

**Files:**
- Modify: `D:\Users\11033406\【03】Workspace\【02】内容知识库专项\km-operation-builder\SKILL.md`

- [ ] **Step 1: 更新 builder_translate_name 文档**

将 SKILL.md 第 104-116 行替换为：

```markdown
### 翻译知识库名称为英文候选

```python
from scripts.builder_entry import builder_translate_name

result = builder_translate_name("质见未来", count=3, kb_id=25706)
# 返回: {
#     "success": True,
#     "candidates": [
#         "kb-future-vision-operation",
#         "kb-quality-horizon-operation",
#         "kb-innovation-forward-operation"
#     ],
#     "original": "质见未来"
# }
```

> **kb_id 参数说明**：传入知识库 ID 可启用会话复用，同一知识库的多次翻译共享上下文，提升翻译一致性。不传则每次请求独立会话。
```

- [ ] **Step 2: 提交代码**

```bash
cd "D:\Users\11033406\【03】Workspace\【02】内容知识库专项\km-operation-builder"
git add SKILL.md
git commit -m "docs: 更新 kb_id 参数说明"
git push origin master
```

---

## 服务器部署命令

用户执行以下命令：

```bash
# 1. SSH 连接到服务器
ssh root@<服务器IP>

# 2. 进入 KM-API 目录
cd /data/KM-API

# 3. 拉取最新代码
git pull origin master

# 4. 编译 TypeScript
/root/.nvm/versions/node/v12.22.12/bin/npx tsc

# 5. 重启服务
pkill -f "node dist/server.js"
nohup node dist/server.js > server.log 2>&1 &
sleep 3

# 6. 验证服务
curl -X POST http://localhost:5052/api/llm/translate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"测试会话复用", "kb_id": 25706}'

# 7. 查看日志确认 conversation_id 返回
tail -20 server.log
```

---

## 验证方案

```bash
# 首次请求（无 conversation_id）
curl -X POST http://localhost:5052/api/llm/translate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"质见未来", "kb_id": 25706}'
# 预期返回: { success: true, data: { content: "...", conversation_id: "xxx" } }

# 第二次请求（带 conversation_id）
curl -X POST http://localhost:5052/api/llm/translate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"运营", "kb_id": 25706, "conversation_id": "上次返回的id"}'
# 预期返回: { success: true, data: { content: "...", conversation_id: "同一id" } }

# 不同 kb_id 隔离测试
curl -X POST http://localhost:5052/api/llm/translate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"另一个知识库", "kb_id": 25707}'
# 预期: 独立会话，不受 kb_id=25706 影响
```

---

## 风险与缓解

| 风险 | 级别 | 缓解措施 |
|------|------|---------|
| KM-API 未更新时调用新接口 | 高 | 保持向后兼容，不传 kb_id 时用默认值 'default' |
| 会话过多占用内存 | 低 | 1 小时超时自动清理 |
| 九问 API 限流 | 中 | 20 QPS 限制，大多数场景足够 |