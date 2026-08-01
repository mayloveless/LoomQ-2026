# L1 设计规格

## 1. 背景和目标

LoomQ L1 的核心是将 OpenQASM 2.0 转换为不同平台的目标 IR，并保证转换前后的量子语义一致。

当前最低目标是复用同一套 Parser 和 IR，打通至少两个模拟器后端，通过 Bell 与 GHZ-3 公开评测，并获得 L1 参赛资格。后端优先级为 SpinQ、Braket、OriginQ。

## 2. 当前范围

第一阶段：OpenQASM 2.0 Parser、平台无关 Circuit IR、SpinQ Serializer、Braket Serializer 和单元测试。

第二阶段：SpinQ Runner、Braket Runner、统一结果 Schema，以及公开 evaluator 通过。

第三阶段：补齐 12 种门、参数表达式、OriginIR Serializer 和 Runner，并测试 GHZ-5、QFT-4、Grover-3 和随机电路。

暂不包含 L2 Agent、L2 前端与可视化、真机运行、L3、RISC-V 或电路优化器。

## 3. 架构

```text
OpenQASM 2.0 Source
        ↓
      Parser
        ↓
    Circuit IR
      ↙     ↘
 SpinQ       Braket
Serializer  Serializer
      ↓       ↓
 Target Native IR
```

运行阶段：

```text
OpenQASM
→ Parser
→ Circuit IR
→ Backend Runner
→ Raw Backend Result
→ Result Normalizer
→ LoomQ Result Schema
```

Parser 和 Circuit IR 均只能有一套；后端差异仅存在于 Serializer、Runner 和结果归一化边界。

## 4. IR 设计原则

IR 至少表达 OpenQASM 版本、量子寄存器、经典寄存器、门操作、参数化门、单量子位测量、整寄存器测量和操作顺序。

建议核心模型：`Circuit`、`QuantumRegister`、`ClassicalRegister`、`QubitRef`、`ClassicalBitRef`、`GateOperation`、`MeasureOperation`。

IR 必须平台无关、可序列化、可验证、可扩展至官方 12 种门，并保留执行顺序；不保存无必要的原始格式信息。

## 5. Parser 责任

Parser 负责去除注释、拆分语句、解析声明/门操作/测量，并校验寄存器存在、索引范围、门参数数量和整寄存器测量长度。对不支持语法必须给出明确错误。

Parser 不负责平台格式转换、量子电路执行、生成测量结果或后端能力降级。

## 6. Serializer 责任

SpinQ 输出完整 OpenQASM 2.0，包含声明、门操作和测量。

Braket 输出完整 OpenQASM 3，使用 `stdgates.inc`，将 `qreg` 转为 `qubit[n]`、`creg` 转为 `bit[n]`；`cx` 可规范化为 `cnot`，但必须保持操作顺序与测量语义。

OriginQ 后续输出 OriginIR。

## 7. 官方门范围

官方 12 种门：

```text
h x s sdg t tdg
ry rz
cx cu1 swap
ccx
```

第一阶段只要求公开用例所需的 `h`、`cx` 和 `measure`，但设计必须可扩展，不能成为 Bell/GHZ 专用逻辑。

## 8. 执行结果 Schema

`run()` 最终必须返回 `backend`、`job_id`、`shots`、`counts`、`bit_order`、`timestamp`，并可选返回 `meta`。

- `shots` 是正整数；`counts` 非空且总数等于 `shots`。
- counts 的 key 是二进制字符串，value 是非负整数。
- `bit_order` 固定为 `little`。
- 禁止 `meta.is_mock = true`。

## 9. 测试策略

单元测试分为 Parser、IR 校验、Serializer、Adapter 路由、Runner、结果归一化和官方 evaluator 测试。

第一阶段验收：

```bash
cd starter-kit
python -m unittest discover -s tests -v
```

第二阶段验收：

```bash
python evaluator.py \
  --level l1 \
  --target spinq,braket \
  --json-out report.json
```

## 10. 完成标准

L1 资格完成要求 Bell 与 GHZ-3 分别在 SpinQ 和 Braket 后端通过，Fidelity 均达到官方阈值；实现不得硬编码用例或返回 mock 结果，并必须使用统一 Parser 和 IR。

## 11. 后续与 L2 的关系

未来 L2 可复用 IR 生成结构化电路，使用 Parser 验证 AI 生成的 QASM，使用 Serializer 输出多平台格式，使用 Runner 执行电路，并使用统一 Schema 展示结果；Parser 错误可供 Agent 自动修复。这里仅定义接口关系，不设计具体 L2 产品。
