# Task 14B：L3 独立审计 + 隐藏测试加固

## 背景

Task 14A 已在独立分支 `feat/l3` 上完成第一版 L3 Hybrid-QASM Compiler，包含 Lexer / Parser / AST / RISC-V codegen / Adapter 接入 / L3 tests。

本任务必须由**新的 Codex thread**执行，目标不是继续沿着原实现思路开发，而是把自己当成：

> **不知道 14A 作者当时怎么想的独立 reviewer / hidden-test 设计者。**

不要相信 14A 的实现报告，也不要因为公开 evaluator 通过就默认实现正确。

L3 官方隐藏评测会随机生成符合题面迷你文法的 Hybrid-QASM，并注入不同测量值，验证寄存器终态 100% 正确。因此本任务的核心是：

1. 从官方题面重新推导契约；
2. 审查第一版实现是否真正覆盖契约；
3. 主动构造 adversarial / hidden-like case；
4. 对确认的问题直接做最小修复并补回归测试；
5. 最终给出“是否可以准备开启 `l3:true`”的结论。

---

## 第一原则

### 1. 先审计，后修改

开始时先阅读并自行建立正确模型，不要一上来重构代码。

至少阅读：

```text
problem_statement.md
starter_kit/README.md
starter_kit/evaluator.py
starter_kit/riscv_emulator.py
starter_kit/adapter.py
starter_kit/loomq/l3/**
starter_kit/tests/test_l3_hybrid.py
```

如仓库内有 Task 14A 文档，只能作为实现背景，**不能作为规则来源**。

官方题面 / Starter Kit 是 source of truth。

### 2. 不碰 L1 / L2 语义

L3 必须继续隔离。

允许修改：

```text
starter_kit/loomq/l3/**
starter_kit/tests/test_l3_hybrid.py
starter_kit/adapter.py   # 仅 compile_hybrid 接线必要时
```

除非发现明确的共享基础设施问题，否则不要修改 L1 / L2 代码。

### 3. 本任务仍然不要开启 submission.yaml 的 l3:true

即使全部通过，也只输出“建议开启 / 暂不建议开启”。

最终开关放到后续收口任务。

---

# Part A：从官方规则重建 L3 契约

先用自己的话写出一份简短 checklist，至少确认：

- `compile_hybrid(hybrid_qasm_str) -> Tuple[list, str]` 的返回契约；
- quantum_ops 应保留什么、排除什么、顺序如何；
- `classical { ... }` 的完整迷你文法；
- `r1..r9 -> x1..x9`；
- `c[k] -> x10+k`；
- 官方 Emulator 支持的指令集合；
- 隐藏评测真正验证的东西是什么；
- 哪些行为题面没有承诺，不应该自行扩展后依赖。

重点防止“实现支持很多东西，但恰好漏掉官方明确要求”的情况。

---

# Part B：架构与正确性审计

审查当前：

```text
lexer.py
parser.py
ast.py
compiler.py
```

重点检查以下问题。

## 1. Lexer

确认：

- token 边界不会依赖公开样例格式；
- 任意合法空白 / 换行不会改变语义；
- `//` 注释不会破坏 token 化；
- `==` / `!=` 不会与单字符 token 混淆；
- `+` / `-` 的词法和表达式语义一致；
- 整数字面量边界正确；
- `r1..r9` 与 `c[k]` 索引校验合理；
- 非法 token 能稳定失败，而不是静默吞掉。

不要为了鲁棒性实现无限制 OpenQASM / C 语法。

## 2. Parser / AST

确认：

- classical block 的边界解析不靠脆弱字符串 split / regex 特判；
- 顺序赋值严格保持顺序；
- if / else 结构语义正确；
- 条件 `==` / `!=` 都正确；
- `+` / `-` 表达式的结合方式与题面一致；
- register / integer / measured bit 的使用符合题面；
- label / AST 节点不存在共享可变状态或跨调用污染；
- 多次调用 `compile_hybrid()` 是独立且 deterministic 的。

如果题面没有要求某种嵌套或多 block 形式，不要为了“更完整语言”进行大重构；但必须确认当前行为不会误解析合法输入。

## 3. quantum_ops 提取

这是容易被忽略的一部分。

确认：

- 量子门和 measurement 按输入原顺序返回；
- classical block 本身绝不进入 quantum_ops；
- classical block 前后的量子操作都不会丢；
- 注释 / 空白不会导致操作丢失或粘连；
- 不把声明 / include 等错误当作量子执行操作（以官方契约为准重新判断）；
- 不因为门参数、多个量子位 operand 等常见 QASM 形式破坏提取。

不要复用 L1 Parser 时强行把 Hybrid-QASM 整体当成普通 OpenQASM 解析，除非确认 classical block 已被安全剥离且语义无损。

## 4. RISC-V codegen

重点确认编译结果在官方 `TinyRISCVEmulator` 上的**最终寄存器语义**正确，而不只是汇编“看起来合理”。

检查：

- `li / add / sub / addi / beq / bne / j` 使用不超出官方支持子集；
- r1..r9 映射正确；
- c[k] 测量值读取正确；
- 临时寄存器不会覆盖用户寄存器或测量输入寄存器；
- if / else label 唯一，不发生嵌套 / 多条件冲突；
- 连续多个 if 或赋值不会跳错 label；
- `==` 与 `!=` 的分支方向正确；
- `a-b` 操作数顺序不能反；
- self assignment（如 `r1 = r1 + 5`）正确；
- register-to-register 运算正确；
- 0、负结果等普通整数语义正确；
- 编译器内部 label/temp counter 每次调用不会产生非确定性污染。

---

# Part C：建立独立 Reference Interpreter

不要只拿“compiler 输出”与自己写的预期汇编比较。

为了做真正 differential testing，请在**测试代码内部**实现一个很小的 reference evaluator / interpreter：

```text
Hybrid classical AST / 随机测试模型
            ↓
直接用 Python 计算期望 r1..r9 终态
```

然后另一边：

```text
同一输入
  ↓
compile_hybrid
  ↓
RISC-V assembly
  ↓
TinyRISCVEmulator
  ↓
实际 x1..x9 终态
```

比较两边结果。

Reference Interpreter 不允许调用 production compiler 的 codegen helper 来计算 expected，否则失去独立性。

---

# Part D：Adversarial / hidden-like 随机测试

在固定 seed 下生成足够多的合法组合，建议不少于 **1000 个 program × 多组 measurement 输入**，运行时间允许时可更多。

覆盖组合至少包括：

- 单赋值；
- 连续多个赋值；
- `rA = literal`；
- register + register；
- register - register；
- register +/- integer；
- self update；
- `c[k] == value`；
- `c[k] != value`；
- if/else 两个方向分别命中；
- 多个 measured bits；
- 多个 if 顺序执行；
- classical block 前后都有 quantum operation；
- whitespace / newline / comments 变体；
- 至少覆盖 r1 与 r9、c[0] 与更高索引；
- 产生 0 / 正数 / 负数结果。

若官方文法明确允许嵌套 if，则必须覆盖；若题面并未承诺，则不要擅自把支持嵌套作为通过条件。

所有随机测试必须固定 seed、可复现，并在失败时打印最小必要 case / seed 方便复现。

---

# Part E：错误输入与 fail-fast

补少量关键非法输入测试即可，不要把任务变成完整编译器诊断工程。

至少确认：

- 未闭合 classical block；
- 非法 register；
- 非法 measured bit；
- 非法 operator / token；
- 缺少必要语法元素。

要求失败明确、deterministic，不得 silently compile 成另一种程序。

---

# Part F：回归与官方 evaluator

完成确认问题的最小修复后，至少运行：

```bash
python starter_kit/evaluator.py --level l3
```

以及仓库现有 L3 单测、完整 Python 测试套件（按当前项目已有命令执行）。

另外确认：

- `git diff --check` 通过；
- `adapter.compile_hybrid()` 签名未变；
- `submission.yaml` 仍保持 `l3:false`；
- L1 / L2 既有测试没有因为 L3 改动退化；
- 无新增不必要依赖。

---

# 不要做

本任务不要：

- 开启 `l3:true`；
- 修改 L2 Prompt / Agent；
- 修改 L1 Parser / serializer / runner 的既有语义；
- 做 Web UI；
- 为 L3 增加 LLM；
- 根据公开 evaluator 样例硬编码；
- 为“可能存在”的语言特性无限扩展 grammar；
- 大规模重构已经正确的代码只为了风格。

---

# 交付报告

结束时一次性汇报，不要中途等待确认。

报告必须包含：

## 1. Independent contract summary

你从官方规则重新推导出的 L3 契约，简短列出。

## 2. Findings

按严重程度列出：

```text
Critical
High
Medium
Low
```

每个问题说明：

- 触发输入；
- 为什么违反官方契约 / 为什么可能 hidden fail；
- 是否已修复；
- 对应新增测试。

如果某级无问题明确写 none。

## 3. Architecture verdict

回答：

- Lexer / Parser / AST / Codegen 分层是否健康；
- 是否存在公开样例特判；
- 是否存在不必要耦合 L1/L2；
- 是否建议重构，还是保持当前结构。

## 4. Random differential evidence

写清：

- seed；
- program 数；
- 每个 program 的 measurement 组合策略；
- 总执行 case 数；
- 失败数；
- 如发现 bug，修复前 / 修复后的结果。

## 5. Regression evidence

列出：

- public L3 evaluator；
- L3 tests；
- full tests；
- git diff --check；
- `l3:false` 状态。

## 6. Final recommendation

只能给出其中一个：

```text
READY_FOR_L3_ENABLE_REVIEW
NOT_READY_FOR_L3_ENABLE_REVIEW
```

并用 2–5 条理由解释。

---

# 验收标准

本 Task 完成要求：

1. 从官方题面独立重建契约，而不是相信 Task 14A；
2. 对 Lexer / Parser / quantum_ops / Codegen 做实质审计；
3. 建立与 production codegen 独立的 reference interpreter；
4. 完成大批量固定 seed differential testing；
5. 所有确认 bug 已最小修复并有回归测试；
6. public L3 evaluator 通过；
7. 完整测试不退化；
8. 仍保持 `l3:false`；
9. 给出明确是否进入 enable review 的结论。

完成后不要 commit、不要 push，等待人工复核。