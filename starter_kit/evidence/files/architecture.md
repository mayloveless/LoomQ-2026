# LoomQ 系统架构说明

## 整体架构

LoomQ 采用分层架构，主要包含 Web 交互层、L2 Agent 层、量子程序验证层、执行适配层以及运行环境层。

整体流程：

```
用户
 |
 v
Web 交互层
 |
 v
L2 Agent
 |
 +----------------+
 |                |
 v                v
目标规格/验证      程序转换
 |
 v
量子执行适配层
 |
 +----------------+
 |                |
 v                v
Origin Quantum   SpinQ Cloud
 |
 v
真实量子设备
```

---

## 1. Web 交互层

技术组成：

- 前端 Web 应用；
- Learn / Explorer / Repair 页面；
- Backend 执行平台选择。

负责：

- 用户输入自然语言需求；
- 展示生成结果；
- 展示验证过程；
- 发起量子程序执行。

---

## 2. L2 Agent 层

负责自然语言到量子程序的转换。

主要流程：

```

User Prompt
|
v
LLM Generation
|
v
OpenQASM
|
v
Semantic Verification
|
v
Repair (optional)

```

其中：

- LLM 负责理解需求和生成候选程序；
- 本地验证器负责判断程序正确性；
- 修复流程根据验证结果生成修正候选。

---

## 3. 量子程序验证层

负责保证 AI 生成程序满足目标要求。

包括：

- OpenQASM parser；
- 电路结构检查；
- statevector 验证；
- fidelity 检查；
- repair candidate 验证。

---

## 4. 执行适配层

提供统一执行接口。

支持：

- 本地模拟执行；
- Origin Quantum Cloud；
- SpinQ Cloud。

不同平台通过独立 adapter 实现平台差异隔离。

---

## 5. 运行环境层

工程化设计：

- Docker 提供一致运行环境；
- 前端静态资源与后端服务统一部署；
- evaluator 提供自动化检查；
- 真机 SDK 采用隔离环境避免依赖冲突。
