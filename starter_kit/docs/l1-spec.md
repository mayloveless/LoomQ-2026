# L1 设计规格

## 目标与范围

L1 将 OpenQASM 2.0 解析为一套平台无关的 Circuit IR，再分别转换或执行于 SpinQ、OriginQ 与 Braket。本实现支持官方 12 门、参数表达式、末尾测量映射及统一的 little-endian counts 结果。

已完成：三种目标 IR、三个本地模拟器 Runner、统一结果 Schema、公开 evaluator 与隐藏风格组合电路回归。

暂不包含：L2 Agent 或界面、L3/RISC-V、电路优化、真机接入和非末尾测量。

## 架构

```text
OpenQASM 2.0
      ↓
   Parser ──语义校验──→ Circuit IR
      ├──→ SpinQ Serializer   ──→ OpenQASM 2.0
      ├──→ OriginQ Serializer ──→ OriginIR
      └──→ Braket Serializer  ──→ OpenQASM 3

Circuit IR
      ├──→ SpinQ Runner   ──→ SpinQ 独立 Worker / Basic Simulator
      ├──→ OriginQ Runner ──→ OriginQ 独立 Worker / CPUQVM
      └──→ Braket Runner  ──→ Braket LocalSimulator
                                   ↓
                         统一 LoomQ Result Schema
```

Parser 只解析与校验；IR 不含平台字段；Serializer 只生成目标文本；Runner 只调用 SDK 并归一化结果；`adapter.py` 仅路由入口。三个后端共享同一 Parser 与 IR，不为公开电路返回固定结果。

## 后端与环境边界

- 主 Python 环境安装 `amazon-braket-sdk==1.108.0`，用于 Braket LocalSimulator。
- SpinQit `0.2.4` 在独立解释器中运行，由 SpinQ Worker 隔离其依赖。
- pyQPanda `3.8.5` 在独立解释器中运行，由 OriginQ Worker 隔离其原生依赖。

公开 `transpile()` 返回提交契约规定的纯文本目标 IR，不依赖 SDK：SpinQ 为 OpenQASM 2.0、OriginQ 为 OriginIR、Braket 为 OpenQASM 3。Runner 的私有 execution mode 则可使用仅为本地 SDK 执行准备的等价表示；该模式不作为公开 `transpile()` 输出。

## IR、门与结果约束

IR 表达量子/经典寄存器、量子位和经典位引用、门操作、参数、测量及操作顺序。支持的门为：

```text
h x s sdg t tdg ry rz cx cu1 swap ccx
```

`run()` 返回 `backend`、`job_id`、`shots`、`counts`、`bit_order`、`timestamp` 和可选 `meta`。`bit_order` 固定为 `little`，counts 总数必须等于 shots；实现不生成 mock counts。

## 验证边界

测试覆盖 Parser、表达式、测量映射、Serializer、Adapter、Runner 与隐藏风格组合电路。公开 evaluator 验证 Bell 和 GHZ-3 在 SpinQ、OriginQ、Braket 三后端的转换和本地执行。完整命令及环境准备见 [l1-runbook.md](l1-runbook.md)。
