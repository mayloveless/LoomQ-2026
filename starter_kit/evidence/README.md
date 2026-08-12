# LoomQ 人工评分证据

这份文件是人工评分材料的统一入口。请直接编辑它，只填写要申报的项目。截图、原始结果或图表统一放在 `starter_kit/evidence/files/`，也可以引用 `starter_kit/` 中已有的代码和文档。

证据包是可选的。没有申报某项人工分时，留空即可，不影响自动评分。

## 提交前填写

把要申报项目的方框改成 `[x]`，并填写对应内容：

- [x] L1 真机
- [ ] L2 交互体验
- [x] 工程与产品化
- [x] 自定义量子 RISC-V Bonus
- [ ] 新手引导与视觉叙事 Bonus

## L1 真机

### 平台一：本源量子

```text
平台名称：本源量子 · 本源悟空 180
平台 job ID：B3EB4CAB2F650CE923DF39C10D8AC0E3
运行时间：2026-08-04 22:53:17.193 至 2026-08-04 22:53:19.161（UTC+8）
芯片运行时间：0.318 秒
shots：1000
量子比特数：2
实际执行的 QASM：starter_kit/circuits/bell.qasm
平台返回的原始结果：starter_kit/evidence/files/B3EB4CAB2F650CE923DF39C10D8AC0E3_probability.csv
平台结果解析：starter_kit/evidence/files/B3EB4CAB2F650CE923DF39C10D8AC0E3-result.json
任务页截图：未提供（选填）
线路服务：开启线路优化、开启映射
真实量子比特：q[37]、q[47]
结果摘要：00=0.483，01=0.048，10=0.025，11=0.444；Bell 相关结果 00+11=0.927
```

### 平台二：量旋云

```text
平台名称：量旋云 · 2 比特核磁量子计算机
平台 job ID：G-260804-0001
运行状态：运行成功
运行时间：2026-08-04 23:02:53 至 2026-08-04 23:04:25（UTC+8）
shots：平台导出结果未提供离散 shots，仅提供归一化概率分布
量子比特数：2
实际执行的 QASM：starter_kit/evidence/files/G-260804-0001-circuit.qasm
平台返回的原始结果：starter_kit/evidence/files/G-260804-0001-result.msgpack.b64
平台结果解析：starter_kit/evidence/files/G-260804-0001-result.json
任务页截图：未提交（选填）
实验来源：云平台
结果摘要：00=0.41767132，01=0.10037047，10=0.06926195，11=0.41269626；Bell 相关结果 00+11=0.83036758
原始文件说明：平台导出的 49 字节 msgpack 以无损 Base64 保存；SHA-256 为 cb6348bcb42a845957b5700beab6e45959a68e08dfb32fb72c0de5e9507c159d
解码命令：base64 -d starter_kit/evidence/files/G-260804-0001-result.msgpack.b64 > task_result_G-260804-0001.msgpack
```

工作人员会核对 job ID、运行时间、电路、shots 和原始结果。截图只能辅助说明，不能代替 job ID 和原始结果。

## L2 交互体验

请填写：

```text
启动界面或 CLI 的命令：[填写]
测试入口或页面地址：[填写，没有则写“无”]
用于交互体验评测的 3 个用户任务：
1. [填写]
2. [填写]
3. [填写]
截图或演示视频：[选填，填写仓库内路径或稳定只读链接]
```

工作人员会在组委会统一模型环境中运行最终代码，测试新手是否看得懂、出错后能否得到有效帮助、结果是否清楚，以及多轮回答是否一致。选手自己的对话截图只用于说明产品流程，不直接证明得分。

## 工程与产品化

已有内容可以直接引用主 README 或其他项目文档，不必复制到本目录。

```text
干净环境中的构建和启动命令：`cd starter_kit && docker build --no-cache -t loomq-l1 . && docker run --rm loomq-l1`
架构说明：`starter_kit/docs/l1-spec.md`；统一 Parser/Circuit IR，经 SpinQ、OriginQ、Braket 的 Serializer 与 Runner 分别转换和执行。
目标用户和使用场景：需要将 OpenQASM 2.0 电路在 SpinQ、OriginQ 或 Braket 本地模拟器上复现与验证的量子计算开发者。
完整使用流程：`starter_kit/docs/l1-runbook.md`；公开三后端报告为 `starter_kit/evidence/files/l1-public-report.json`。
```

工作人员会按最终 commit 实际构建和启动，并检查文档与代码是否一致、产品是否真的降低了量子计算的使用门槛。

## 自定义量子 RISC-V Bonus

以下三项必须齐全且测试通过，才获得 8 分：

```text
指令编码规格：starter_kit/bonus/quantum_riscv/SPEC.md
模拟器扩展实现：starter_kit/bonus/quantum_riscv/emulator.py（`QuantumRISCVEmulator` 继承官方 `TinyRISCVEmulator`，复用 parser/寄存器/标签语义，并在 fork 的取指循环中增加 `.word` custom-0 解码与量子协处理器派发）
端到端测试命令：python -m unittest starter_kit.tests.test_quantum_riscv_bonus -v
```

## 新手引导与视觉叙事 Bonus

请填写已有材料的路径，不要求为评分另写一套文档：

```text
零基础首次运行指南：[填写]
量子概念解释：[填写]
结果可视化：[填写]
错误恢复或无障碍引导：[填写]
```

以上四项各 1 分。普通项目 README 完整不代表自动获得 Bonus。

## 提交规则

- 所有材料都要在截止前进入最终提交的 commit，工作人员不接受截止后补交。
- 外部视频可以用稳定只读链接，源码、原始结果和复现命令应保存在仓库中。
- 整个 fork commit 的归档包不得超过 100 MiB。
- 不要提交 API Key、Token、Cookie、个人身份信息或平台账户隐私。
- 如申报 L1 真机分，在最终提交 Issue 的 `Hardware evidence` 中填写 `starter_kit/evidence/README.md`。
