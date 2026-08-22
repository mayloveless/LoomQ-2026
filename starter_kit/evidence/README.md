# LoomQ 人工评分证据

这份文件是人工评分材料的统一入口。请直接编辑它，只填写要申报的项目。截图、原始结果或图表统一放在 `starter_kit/evidence/files/`，也可以引用 `starter_kit/` 中已有的代码和文档。

证据包是可选的。没有申报某项人工分时，留空即可，不影响自动评分。

## 提交前填写

把要申报项目的方框改成 `[x]`，并填写对应内容：

- [x] L1 真机
- [x] L2 交互体验
- [x] 工程与产品化
- [ ] 自定义量子 RISC-V Bonus
- [ ] 新手引导与视觉叙事 Bonus

## L1 真机

每个平台填写一次。

- 平台名称：Origin Quantum Cloud（后端：WK_C180）
- 平台 job ID：C631C56659A127243AFDB9D2B1086683
- 运行时间：2026-08-21T13:52:28.326096Z（UTC）
- shots：1000
- 实际执行的 QASM：[输入 QASM](files/l1-real-hardware/originq/C631C56659A127243AFDB9D2B1086683-input.qasm)
- 平台返回的原始结果：[raw result](files/l1-real-hardware/originq/C631C56659A127243AFDB9D2B1086683-raw-result.json)
- 任务页截图：[submitted.png](files/l1-real-hardware/originq/C631C56659A127243AFDB9D2B1086683-submitted.png)
- 实际提交的 OriginIR：[submitted.originir](files/l1-real-hardware/originq/C631C56659A127243AFDB9D2B1086683-submitted.originir)
- 提交记录：[submission.json](files/l1-real-hardware/originq/C631C56659A127243AFDB9D2B1086683-submission.json)
- metadata：[metadata.json](files/l1-real-hardware/originq/C631C56659A127243AFDB9D2B1086683-metadata.json)

- 平台名称：SpinQ Cloud（后端：gemini_vp）
- 平台 job ID：G-260821-0005
- 运行时间：2026-08-21T14:46:21.039462Z（UTC）
- shots：1000
- 实际执行的 QASM：[submitted.qasm](files/l1-real-hardware/spinq/G-260821-0005-submitted.qasm)
- 平台返回的原始结果：[raw result](files/l1-real-hardware/spinq/G-260821-0005-raw-result.json)
- 原始输入 QASM：[input.qasm](files/l1-real-hardware/spinq/G-260821-0005-input.qasm)
- 解析后的结果：[parsed result](files/l1-real-hardware/spinq/G-260821-0005-parsed-result.json)
- metadata：[metadata.json](files/l1-real-hardware/spinq/G-260821-0005-metadata.json)

## L2 交互体验

```text
启动界面或 CLI 的命令：
docker build -t loomq-final .

由评测运行环境注入：
LOOMQ_LLM_BASE_URL
LOOMQ_LLM_API_KEY
LOOMQ_LLM_MODEL

启动 Web：
docker run --rm -p 8000:8765 \
  -e LOOMQ_LLM_BASE_URL \
  -e LOOMQ_LLM_API_KEY \
  -e LOOMQ_LLM_MODEL \
  loomq-final \
  python -m loomq.debug_web --host 0.0.0.0 --port 8765 --serve-web

测试入口：http://localhost:8000

用户任务：
1. 在 Explorer 输入“创建一个 Bell 态量子电路并测量”，查看自然语言生成的 OpenQASM、电路过程与语义验证结果。
2. 在“程序修复”页粘贴包含错误的 OpenQASM，并说明目标；查看 parser/语义验证诊断与可确认的修复提案。
3. 在 Learn 页面按步骤阅读 Bell 电路说明、查看状态变化与 QASM，再进入可选的真实量子设备体验入口。
```

- [首页入口](files/l2-agent/home.png)
- [Learn 教学、QASM 与状态变化](files/l2-agent/learn.gif)
- [自然语言生成、QASM 与电路过程](files/l2-agent/explorer-generation.gif)
- [验证或修复结果](files/l2-agent/repair-verification.gif)
- [执行平台选择](files/l2-agent/choose-backend.gif)

## 工程与产品化

```text
干净环境中的构建和启动命令：

docker build -t loomq-final .

启动 Web：
docker run --rm \
  --env-file .env.l2.local \
  -p 8000:8765 \
  loomq-final \
  python -m loomq.debug_web --host 0.0.0.0 --port 8765 --serve-web

自动化自检：
docker run --rm \
  --env-file .env.l2.local \
  -v "$PWD/runtime/reports:/reports" \
  loomq-final \
  python evaluator.py --level all --target spinq,originq,braket --json-out /reports/all.json

架构说明：
evidence/architecture.md

目标用户和使用场景：
面向量子计算初学者和开发者，通过自然语言交互、可视化学习流程与真实设备体验，降低量子程序编写、理解和执行的门槛。

完整使用流程：
1. 在 Learn 页面阅读量子电路、QASM 与状态变化说明。
2. 在 Explorer 使用自然语言生成量子程序，并查看生成与验证过程。
3. 在程序修复页诊断并修复已有 OpenQASM。
4. 从 Learn 的可选入口提交实验并查看执行结果。

架构文档：见 evidence/architecture.md
```

- [Docker Web 首页](files/product/docker-web.png)
- [系统架构与模块流程](files/product/architecture.png)
- [自动化评测结果](files/product/evaluator.png)

## 自定义量子 RISC-V Bonus

以下三项必须齐全且测试通过，才获得 8 分：

```text
指令编码规格：[填写文档路径]
模拟器扩展实现：[填写代码路径]
端到端测试命令：[填写命令或文档路径]
```

## 新手引导与视觉叙事 Bonus

请填写已有材料的路径，不要求为评分另写一套文档。

## 提交规则

- 所有材料都要在截止前进入最终提交的 commit。
- 不要提交 API Key、Token、Cookie、个人身份信息或平台账户隐私。
