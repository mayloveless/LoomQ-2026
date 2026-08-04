# Task 11：L2 Agent 核心闭环与确定性工具

## 目标

实现可被官方 `agent_chat(prompt: str) -> str` 调用的 L2 核心闭环，为后续三类客观评测打基础：

1. 根据自然语言生成 OpenQASM 2.0 电路；
2. 修复有语法或结构问题的 OpenQASM 2.0，并保持用户声明的目标态语义；
3. 根据比特数、真机/模拟器、排队和费用约束推荐官方规范后端标识。

本任务只实现后端核心和自动化测试：

- 不做网页或 CLI；
- 不填写 L2 交互体验证据；
- 不开始 L3；
- 不修改任何 L1 Parser、Serializer、Runner 或结果逻辑；
- 暂不把 `submission.yaml` 中 `levels.l2` 和 `network.required_for_l2` 改为 `true`，等后续真实模型回归通过后再开启。

正式评测要求每个 case 至少发生一次有效模型服务调用，因此不得用纯规则或硬编码答案绕过 LLM。确定性工具用于校验、修复和约束模型，而不是替代模型调用。

## 官方契约

入口保持：

```python
def agent_chat(prompt: str) -> str:
    ...
```

使用仓库现有 `llm_client.chat_completion(messages)`，从以下环境变量读取配置：

- `LOOMQ_LLM_BASE_URL`
- `LOOMQ_LLM_API_KEY`
- `LOOMQ_LLM_MODEL`
- `LOOMQ_LLM_TIMEOUT_SECONDS`

不得硬编码 URL、Key 或模型名，不得在异常、日志或测试快照中暴露 Key。

## 实现范围

### 1. 建立轻量 L2 模块边界

新增最少且职责清晰的模块，例如：

```text
starter_kit/loomq/l2_agent.py
starter_kit/loomq/qasm_tools.py
starter_kit/loomq/backend_selector.py
```

名称可根据现有代码风格调整，但不要引入大型 Agent 框架、RAG 框架或额外第三方依赖。

`adapter.agent_chat()` 只负责委托给 L2 核心，不在 `adapter.py` 中堆叠 Prompt、解析和筛选逻辑。

### 2. 封装模型调用与响应读取

在 L2 核心中调用现有：

```python
llm_client.chat_completion(messages)
```

需要：

- 正确读取 `choices[0].message.content`；
- 校验返回结构和 content 类型；
- 对缺字段、空字符串、非 JSON 响应给出明确但不泄露凭证的错误；
- 模块导入时不得发起网络请求；
- 允许测试注入或 patch 模型调用函数，不要把测试替身写进生产分支。

### 3. 设计单次主调用的结构化协议

第一次模型调用应同时完成任务识别和候选产物生成，建议要求模型返回一个 JSON 对象：

```json
{
  "task_type": "generate_qasm | repair_qasm | select_backend",
  "qasm": "OPENQASM 2.0; ... 或 null",
  "backend_constraints": {
    "min_qubits": null,
    "require_qpu": null,
    "require_no_queue": null,
    "cost_policy": null,
    "requires_account": null
  },
  "explanation": "简短说明"
}
```

约束：

- 不把公开示例答案硬编码进 Prompt；
- Prompt 要说明只使用 OpenQASM 2.0 和当前项目支持的 12 种门；
- 对生成/修复任务，要求完整声明 `qreg`、`creg` 并进行目标要求的测量；
- 对修复任务，必须优先保持用户明确说明的目标态或目标功能，不能只修到“语法可解析”；
- 对后端选择任务，只让模型提取约束，最终后端集合由本地能力表确定；
- 对结构化 JSON 外包裹 Markdown 代码块的常见情况要能稳健解析；
- 不需要支持任意复杂 JSON 修复，只需给出清晰失败信息。

### 4. OpenQASM 提取和本地校验

新增可独立测试的工具：

```python
def extract_qasm(text: str) -> str | None: ...
def validate_qasm(qasm: str) -> None: ...
```

要求：

- 可从纯文本或 Markdown fenced code block 中提取完整 `OPENQASM 2.0;` 程序；
- 使用现有 `loomq.parser.parse_qasm()` 做真实语法和语义校验；
- 不复制另一套正则 Parser；
- 返回最终答案时必须包含可被官方 evaluator 提取的完整 `OPENQASM 2.0;` 程序；
- 建议使用 ` ```qasm ` 代码块并附一两句简短说明，但不要让说明插入 QASM 程序内部。

若第一次生成的 QASM 无法通过现有 Parser：

1. 最多再发起一次模型修复调用；
2. 将原始用户目标、候选 QASM 和经过清理的 Parser 错误发送给模型；
3. 再次提取并校验；
4. 第二次仍失败则明确报错，不无限重试。

错误消息不得包含 API Key、本机绝对路径或完整 Python traceback。

### 5. 确定性后端选择器

加载：

```text
starter_kit/backend_capabilities.json
```

要求：

- 使用相对于当前模块/Starter Kit 的稳定路径，不依赖运行目录；
- 启动时或首次使用时校验顶层结构、`backends` 数组和必要字段；
- 不把能力表内容复制进 Prompt 或源码常量；
- 至少支持以下筛选条件：
  - 最小量子比特数；
  - 是否必须为真实 QPU；
  - 是否要求零排队；
  - 费用策略：仅免费、允许免费额度、允许付费；
  - 是否允许需要账号；
- 返回所有满足条件的规范 `id`，顺序保持能力表中的稳定顺序；
- 无满足项时如实说明，并给出“放宽哪项约束”的一般性建议，不编造不存在的后端；
- 最终回复必须原样包含规范标识，例如 `originq_local_simulator`。

注意：后端选择任务也必须先发生有效模型调用，由模型提取自然语言约束；本地选择器只负责依据官方 JSON 得出正确集合。

### 6. `agent_chat` 的最终行为

#### 生成或修复 QASM

返回：

```text
简短自然语言说明

```qasm
OPENQASM 2.0;
...
```
```

最终 QASM 必须已经通过 `parse_qasm()`。

#### 推荐后端

返回：

- 满足全部条件的一个或多个规范后端 ID；
- 一句基于能力表字段的简短理由；
- 无匹配时明确说明无解，不要随意推荐不满足条件的后端。

#### 不支持或无法解析的请求

返回清晰的用户可理解错误；不得返回内部 traceback、请求头或 API Key。

### 7. 自动化测试

新增 L2 专项测试，使用 `unittest.mock` 或等价标准库能力注入模型响应，不访问公网。

至少覆盖：

1. **GHZ 生成**：模拟模型返回完整 3 比特 GHZ QASM，`adapter.agent_chat()` 输出可被提取并通过 `parse_qasm()`；
2. **Bell 修复**：第一次模型返回仍有错误的 Bell QASM，第二次修复调用返回正确程序，确认总调用次数为 2；
3. **一次成功不重试**：合法 QASM 只调用一次模型；
4. **最多修复一次**：两次均非法时停止并给出稳定错误；
5. **后端选择**：模拟模型提取“15 比特、零排队”，本地工具返回官方 JSON 中全部正确规范 ID；
6. **免费真机选择**：模拟模型提取“真实硬件、5 比特、不付费”，返回满足条件的规范 ID；
7. **无解约束**：超过所有可用后端能力或约束冲突时明确无解；
8. **模型响应异常**：缺少 `choices`、空 content、非法 JSON 均产生可理解错误；
9. **安全性**：异常文本中不包含测试 API Key；
10. **路径稳定性**：从 Starter Kit 之外的工作目录调用后端选择器仍能加载能力表。

测试中不得直接硬编码选择结果作为生产实现；测试期望值可以从官方能力表推导，或明确列出作为契约断言。

### 8. 回归验证

至少执行：

```bash
cd starter_kit
python -m unittest discover -s tests -v
```

并单独执行新增的 L2 测试模块。

若可以方便地启动本地 OpenAI-compatible stub HTTP 服务，可额外验证：

```bash
python evaluator.py --level l2
```

但不要为了本任务修改官方 evaluator，也不要把固定假模型接入生产代码。

L1 回归要求：

- 现有 L1 单元测试无新增失败；
- 不要求重新无缓存构建完整 Docker，除非依赖或 Dockerfile 被修改；
- 本任务原则上不应修改依赖和 Dockerfile。

## 修改边界

允许修改或新增：

- `starter_kit/adapter.py`
- `starter_kit/loomq/` 下新的轻量 L2 模块
- `starter_kit/tests/` 下 L2 专项测试
- 必要时对 `starter_kit/llm_client.py` 做极小的、契约兼容的健壮性修复
- 必要的 L2 开发文档，但本任务不要求新增长篇文档

不要修改：

- L1 Parser、IR、Serializer、Runner、测量映射和 evaluator；
- `submission.yaml` 的 L2 开关；
- Dockerfile 或依赖文件，除非出现无法绕开的真实阻断，且需在汇报中说明；
- 真机证据文件；
- L3 相关代码。

不要：

- commit 或 push；
- 使用真实 API Key 写入测试或仓库；
- 引入 LangChain、AutoGen 等大型框架；
- 用关键词分支直接返回 GHZ、Bell 或后端固定答案；
- 无限循环调用模型；
- 为通过公开 `GHZ` 用例而写公开题专用逻辑。

## 验收标准

- `adapter.agent_chat(prompt)` 已可用，并至少完成一次真实的模型传输函数调用路径；
- 生成与修复后的 QASM 都经过现有 Parser 校验；
- 非法 QASM 最多进行一次模型修复；
- 后端选择由 `backend_capabilities.json` 确定性筛选，并输出规范 ID；
- 三类任务都有不访问公网的自动化测试；
- 模型响应异常不会泄露凭证或 traceback；
- 全量单元测试通过，L1 无回归；
- `submission.yaml` 仍保持 L2 为 `false`；
- 未 commit、未 push。

## 完成后汇报

只需汇报：

1. 新增模块及职责；
2. 首次模型调用的结构化协议；
3. QASM 校验与一次修复闭环；
4. 后端约束字段和筛选结果；
5. L2 专项及全量测试结果；
6. 是否修改 `llm_client.py`、依赖或 Docker；
7. 当前还缺什么才能把 `submission.yaml` 的 L2 开关设为 `true`。
