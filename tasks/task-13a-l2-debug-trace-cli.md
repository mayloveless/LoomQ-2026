# Task 13A：L2 Debug Trace 协议 + 最小可步进 CLI

## 背景

L2 客观评分链路已经稳定并开启：`agent_chat(prompt: str) -> str` 通过真实 DeepSeek、独立 target judge、Parser、本地 Braket statevector、Fidelity、自修复与确定性 backend selection 完成评分任务。

接下来进入 L2 交互体验。目标不是再做一个聊天壳，而是把 LoomQ 做成面向“不懂量子的开发者”的 **Quantum DevTools**：让用户像看 Web DevTools / Debugger 一样，理解自然语言请求如何经过 Agent、Parser、模拟器和本地裁判得到结果。

最终 Web 版会做真正的 DevTools 式界面，但本任务先建立可复用的 **Trace 协议**，并用一个很薄的 CLI 验证这套调试交互是否成立。

本任务不再拆成“只做 Trace”和“只做 CLI”两个任务；Trace 如果没有实际消费者无法验证设计，CLI 如果不复用 Trace 又会成为一次性代码。

---

## 目标

新增一条**可观察但不改变生产行为**的调试执行路径：

```text
用户自然语言
  ↓
[LLM] 识别任务 / 生成候选
  ↓
[LLM] 独立 Target Judge（QASM 任务）
  ↓
[LOCAL] Parser / QASM Validation
  ↓
[LOCAL] Statevector Simulation + Fidelity
  ↓
[LLM] Repair（仅必要时）
  ↓
[LOCAL] Backend Selection（backend 任务）
  ↓
最终结果
```

CLI 能在这些关键阶段之间逐步查看：

```text
[n / Enter] next
[c] continue
[q] quit
```

重点是让开发者清楚区分：**哪一步由 LLM 判断，哪一步由本地确定性代码执行。**

---

## 第一原则：不要复制 Agent 逻辑

严禁为了 CLI 再实现一份 `agent_chat` 流程。

应将当前生产 Agent 内部整理为一个共享执行函数，例如：

```python
_run_agent(prompt: str, trace_sink=None) -> str
```

或等价设计。

要求：

- `agent_chat(prompt)` 继续调用同一条共享生产路径，只是 `trace_sink=None`；
- Debug CLI 也调用同一条共享生产路径，但提供 trace sink / observer；
- 不能出现“正式评分走 A 逻辑，CLI 走 B 逻辑”；
- 不允许为了 Trace 增加额外 LLM 调用；
- 不允许为了 Trace 额外执行一次模拟器；
- Trace 关闭时不得产生 stdout/stderr、额外网络请求或额外 SDK 工作。

`starter_kit/adapter.py` 中官方 `agent_chat(prompt: str) -> str` 的签名与返回格式必须保持不变。

---

## Trace 协议

新增轻量模块，例如：

```text
starter_kit/loomq/debug_trace.py
```

定义稳定、可序列化的数据结构。具体使用 dataclass / TypedDict 均可，但不要引入新依赖。

建议每个事件至少包含：

```text
seq        单次请求内递增序号
stage      稳定机器字段
executor   llm | local
status     running | ok | warning | error
summary    给开发者看的简短说明
data       该阶段的结构化安全数据
```

不要把终端排版字符串本身当成 Trace 协议。Trace 是未来 Web DevTools 也要消费的结构化数据。

### 建议阶段

不要为了数量制造事件，只覆盖真正有解释价值的边界。

QASM 正常路径至少应能观察：

```text
intent
qasm_candidate
target_spec
parser_validation
semantic_verification
completed
```

触发修复时追加：

```text
repair_started
repair_candidate
```

Backend 路径至少应能观察：

```text
intent
backend_constraints
backend_selected
completed
```

阶段命名可以根据现有代码结构做小幅调整，但必须稳定、可测试，并适合下一步 Web 消费。

---

## Trace 内容边界

### 可以包含

- `task_type`；
- 候选 / 最终 QASM；
- 是否要求测量；
- local pure-state guard 是否命中；
- target verification mode；
- target qubit count；
- target amplitudes（若为 statevector）；
- Parser 成功状态；
- Fidelity 与阈值；
- 是否触发 repair；
- 清理后的 repair diagnostic；
- backend constraints；
- canonical backend IDs；
- LLM 调用序号（如 1 / 2 / 3），用于解释 Agent 成本与流程。

### 严禁包含

- API Key；
- Authorization / Bearer Header；
- 完整环境变量；
- `.env.l2.local` 内容；
- HTTP request headers；
- 原始 SDK traceback；
- 本机绝对路径；
- 未清理的模型异常；
- 为调试方便直接 dump 完整 OpenAI-compatible response 对象。

Trace 必须复用当前已有的错误清理边界。

---

## CLI

新增最小入口，例如：

```text
starter_kit/loomq/debug_cli.py
```

启动方式建议：

```bash
cd starter_kit
python -m loomq.debug_cli "生成一个 Bell 态并测量"
```

本地真实 API 仍由 shell 注入环境变量；CLI 不自动读取 `.env`，不引入 `python-dotenv`：

```bash
set -a
source .env.l2.local
set +a
python -m loomq.debug_cli "生成一个 Bell 态并测量"
```

### CLI 的交互

默认使用 step 模式。

每收到一个 TraceEvent，打印一个紧凑阶段块，并暂停：

```text
[1] LLM · Intent
    task: generate_qasm

[Enter/n] next  [c] continue  [q] quit
```

随后例如：

```text
[2] LLM · QASM Candidate
    OPENQASM 2.0;
    ...
```

```text
[3] LLM · Target
    |00>  +0.707107
    |11>  +0.707107
```

```text
[4] LOCAL · Parser
    ✓ OpenQASM 2.0 valid
```

```text
[5] LOCAL · Semantic Verify
    fidelity: 1.000000
    threshold: 0.970000
    ✓ passed
```

最后输出最终 `agent_chat` 结果。

### 操作语义

- `Enter` 或 `n`：执行到下一个可观察阶段；
- `c`：本次请求后续阶段不再暂停，但仍继续打印 Trace；
- `q`：只终止 CLI 本次调试，不需要保证返回完整 Agent 结果；不得影响生产 `agent_chat`。

可以由 trace callback 在事件到达后阻塞等待输入；不要求本任务实现通用异步 debugger、线程控制或真正任意位置断点。

**这里的“step”是 Agent pipeline 阶段级 step，不是 Python 源码行级 debugger。**

---

## 人话解释原则

CLI 面向“不懂量子的开发者”，不是面向量子专家。

每个阶段最多补一句解释，例如：

```text
LOCAL · Semantic Verify
LoomQ 真的在本地模拟了这段电路，而不是只相信模型写出的代码。
```

不要在 CLI 内再调用 LLM 生成解释；使用确定性的短文案即可。

不要一次输出长篇量子教程。

---

## 不在本任务做的内容

本任务**不要**做：

- Web / React / Next.js 页面；
- 浏览器 SSE / WebSocket；
- 图形化量子电路；
- Bloch sphere；
- 完整 statevector 概率图；
- 任意 stage breakpoint 配置；
- 保存历史 trace；
- 多会话；
- 用户账号；
- UI 设计系统；
- L3；
- 再扩大 pure-state guard 或 L2 Prompt。

这些只有在 CLI 验证 Trace 协议后，才进入下一 Task 的 Web DevTools。

---

## 对 L2 客观部分的保护

L2 objective 已冻结。本任务是 additive observability，不允许借机重构业务规则。

必须保持：

- Backend 路径仍严格 1 次模型调用；
- QASM 正常路径仍 2 次模型调用；
- 修复路径最多 3 次，无第 4 次；
- statevector Fidelity 阈值与语义不变；
- pure-state downgrade guard 不变；
- backend capability filtering 不变；
- `submission.yaml` 保持当前 L2 开启状态；
- `adapter.agent_chat()` 的返回文本对相同 mock 响应应保持一致。

---

## 测试

至少覆盖：

1. Trace 关闭时 `agent_chat()` 行为与当前一致；
2. Trace 关闭时不向 stdout/stderr 输出 debug 信息；
3. QASM 正常路径事件顺序稳定；
4. QASM repair 路径包含 repair 事件，且模型调用仍最多 3 次；
5. Backend 路径包含 constraints / selected 事件，且模型调用仍恰好 1 次；
6. QASM candidate / target / Fidelity 等关键结构化数据进入正确事件；
7. Trace 中不出现测试用假 API Key、Bearer token、环境变量 dump 或绝对路径；
8. CLI `next` 能逐事件推进；
9. CLI `continue` 后不再暂停但继续输出事件；
10. CLI `quit` 只终止调试入口，不改变生产 Agent；
11. 原有 L2 专项测试全部通过；
12. 全量测试通过；
13. `python evaluator.py --level l2` 继续 PASS。

---

## 真实 API 冒烟

使用现有 `.env.l2.local` 的真实 DeepSeek 配置，只做轻量验证，不重新跑 12C 大矩阵。

至少：

### A. QASM

```text
生成一个 Bell 态并测量
```

确认 CLI 能看到：

```text
LLM → LLM → LOCAL → LOCAL
```

等实际阶段，并最终正常返回 QASM。

### B. Backend

```text
需要至少 15 比特、零排队的后端
```

确认 CLI 清楚展示：

```text
LLM 提取约束
→ LOCAL 查能力表
→ canonical backend IDs
```

并且只有一次模型调用。

不需要因为 CLI 再重复 12C 的全部真实回归。

---

## 完成标准

Task 13A 完成时应满足：

- 存在稳定、结构化、无 UI 绑定的 TraceEvent 协议；
- CLI 与官方 `agent_chat` 共用同一条生产执行路径；
- Trace 默认关闭，对正式评分路径零额外模型调用、零额外模拟；
- CLI 可 `next / continue / quit`；
- 用户能明显看出哪些阶段是 `LLM`、哪些是 `LOCAL`；
- QASM 正常 / repair / backend 三种路径都能正确产生 trace；
- 没有凭证或内部异常泄漏；
- L2 objective 回归与 public evaluator 继续通过；
- 真实 DeepSeek 两个 CLI 冒烟通过。

---

## 完成后汇报

只汇报：

1. TraceEvent 最终 schema；
2. 生产 `agent_chat` 与 Debug CLI 如何共享执行路径；
3. QASM 正常路径实际事件序列；
4. repair 路径实际事件序列；
5. backend 路径实际事件序列；
6. CLI 的 `next / continue / quit` 行为；
7. 真实 DeepSeek QASM / backend 冒烟结果和调用次数；
8. 专项 / 全量 / public evaluator 结果；
9. 下一步做 Web DevTools 前，Trace 协议还缺什么。

本任务结束时不要 commit，不要 push，等待人工复核。
