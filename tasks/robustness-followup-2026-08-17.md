# LoomQ Robustness Follow-up

> 独立记录本轮新发现的两个工程防线。
>
> 当前已有其他任务在实施既有优化，本文件只用于暂存新增候选，避免修改正在被执行的 `tasks/optimization-backlog.md`。完成当前优化批次后，再统一判断是否吸收到正式 task。

## 1. OpenQASM 整寄存器门操作

### 问题

当前 L1 Parser 对门操作数主要按显式下标形式处理，例如：

```qasm
x q[0];
cx q[0], r[0];
```

需要额外覆盖 OpenQASM 2 中整寄存器形式，例如：

```qasm
x q;
cx q, r;
```

预期语义：

- 单比特门作用于整个量子寄存器时，逐位展开；
- 多比特门的操作数均为等长寄存器时，按相同 index 配对展开；
- 不允许不明确的寄存器广播与显式下标混用；
- 多寄存器长度不一致时应明确失败，而不是静默截断或错误展开。

### 建议验收

- `x q;` 与显式逐位 `x q[0]; x q[1]; ...` 语义一致；
- `cx q, r;` 与逐位配对 CX 语义一致；
- 等长、多寄存器、混合非法形式均有单测；
- transpile 到三个目标后仍通过既有 target-native / semantic validation；
- 不扩大正式支持门集，只补齐已有门的合法操作数表达方式。

### 优先级

`P1`。属于标准语法边界，改动面相对有限，适合在 L1 robustness audit 中吸收。

---

## 2. L3 Emulator Execution-Step Budget

### 问题

L3 即使语义正确，也可能生成过长或控制流膨胀的汇编，最终触碰官方 Tiny RISC-V emulator 的执行步数上限。

现有随机程序 + 测量位穷举测试主要验证最终寄存器状态，应再增加资源余量断言，避免“结果正确但隐藏 case 超步数”。

### 建议验收

- 在 L3 differential / fuzz 测试中记录实际执行 step 数，而不只统计汇编文本行数；
- 为官方执行上限保留安全余量，例如测试集峰值不得接近硬上限；
- 覆盖嵌套 `if/else`、顺序赋值、寄存器自引用和多个测量位等较重路径；
- 若未来 codegen 修改导致峰值明显上升，回归测试直接失败并显示最坏 case；
- 自定义量子 RISC-V Bonus 的 E2E 也应有同类资源上限检查。

### 优先级

`P1`。实现成本低，能直接防止隐藏集中的资源型失败。

---

## 本轮明确不扩展

暂不因为健壮性审计额外扩大 OpenQASM 门集，例如新增 `u2 / u3 / cu3 / ch` 等非当前正式目标门。除非后续官方契约或测试证明确有必要，否则优先保持 Parser / IR / Serializer 的稳定边界。

## 后续处理

当前优化批次完成后：

1. 对照届时代码确认这两项是否已经被其他 task 顺带覆盖；
2. 未覆盖的项再拆成最小正式 task；
3. 修改 Parser / IR / codegen 后，重新跑 L1 target-native validation；
4. 修改 L3 codegen 后，重新跑随机程序 + 全测量注入 differential tests 与 step-budget 回归。
