# LoomQ 人工评分证据

这份文件是人工评分材料的统一入口。请直接编辑它，只填写要申报的项目。截图、原始结果或图表统一放在 `starter_kit/evidence/files/`，也可以引用 `starter_kit/` 中已有的代码和文档。

证据包是可选的。没有申报某项人工分时，留空即可，不影响自动评分。

## 提交前填写

把要申报项目的方框改成 `[x]`，并填写对应内容：

- [x] L1 真机
- [x] L2 交互体验
- [x] 工程与产品化
- [x] 自定义量子 RISC-V Bonus
- [x] 新手引导与视觉叙事 Bonus

## L1 真机

（保持已有内容）

## L2 交互体验

（保持已有内容）

## 工程与产品化

```text
干净环境中的构建和启动命令：

docker build -t loomq-final .

由评测运行环境注入 LOOMQ_LLM_BASE_URL、LOOMQ_LLM_API_KEY、LOOMQ_LLM_MODEL、SPINQ_USERNAME 与 SPINQ_KEY_PATH 后启动 Web。

自动化自检：

docker run --rm \
  -e LOOMQ_LLM_BASE_URL \
  -e LOOMQ_LLM_API_KEY \
  -e LOOMQ_LLM_MODEL \
  -v "$PWD/runtime/reports:/reports" \
  loomq-final \
  python evaluator.py --level all --target spinq,originq,braket --json-out /reports/all.json

架构说明：
evidence/architecture.md

目标用户和使用场景：面向量子计算初学者和开发者，通过自然语言交互、可视化学习流程与真实设备体验，降低量子程序编写、理解和执行的门槛。

完整使用流程：
1. 在 Learn 页面阅读量子电路、QASM 与状态变化说明。
2. 在 Explorer 使用自然语言生成量子程序，并查看生成与验证过程。
3. 在程序修复页诊断并修复已有 OpenQASM。
4. 从 Learn 的可选入口提交实验并查看执行结果。
5. Origin Quantum Cloud 与 SpinQ Cloud 的真实设备任务记录见 L1 真机证据。

产品截图：见下方链接。
```

- [Docker Web 首页](files/product/docker-web.png)
- [Learn、Explorer 与后端流程](files/product/workflow.png)
- [SpinQ 真机结果](files/product/real-hardware.png)

## 自定义量子 RISC-V Bonus

以下三项必须齐全且测试通过，才获得 8 分：

```text
指令编码规格：[填写文档路径]
模拟器扩展实现：[填写代码路径]
端到端测试命令：[填写命令或文档路径]
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
