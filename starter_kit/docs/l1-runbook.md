# L1 复现手册

## 架构概览

L1 以一套 OpenQASM 2.0 Parser 和平台无关 Circuit IR 为核心。SpinQ、OriginQ、Braket 各自只负责目标 IR 转换与本地模拟器执行，结果统一为 little-endian counts Schema。详细边界见 [l1-spec.md](l1-spec.md)。

## 后端与版本

| 后端 | 执行组件 | 版本 | 环境 |
| --- | --- | --- | --- |
| Braket | LocalSimulator / amazon-braket-sdk | 1.108.0 | 主 Python 3.10 |
| SpinQ | Basic Simulator / SpinQit | 0.2.4 | 独立 Worker Python |
| OriginQ | CPUQVM / pyQPanda | 3.8.5 | 独立 Worker Python |

## 推荐：Docker 复现

从仓库根目录执行：

```bash
cd starter_kit
docker build --no-cache -t loomq-l1 .
docker run --rm loomq-l1
docker run --rm loomq-l1 python -m unittest discover -s tests -v
docker run --rm loomq-l1 python -m unittest tests.test_originq_runner tests.test_originq_worker tests.test_originq_serializer -v
docker run --rm loomq-l1 python -m unittest tests.test_l1_hidden_like -v
```

容器默认命令会执行 `spinq,originq,braket` 三后端的公开 evaluator。要将实际报告写入证据目录：

```bash
mkdir -p evidence/files
docker run --rm -v "$(pwd)/evidence/files:/evidence" loomq-l1 \
  python evaluator.py --level l1 --target spinq,originq,braket \
  --json-out /evidence/l1-public-report.json
```

## 可选：本地开发环境

主环境使用 Python 3.10 和 Braket：

```bash
cd starter_kit
python3.10 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

SpinQ 与 OriginQ 建议分别创建独立的 Python 3.10 环境，安装 `requirements-spinq.txt`、`requirements-originq.txt` 后，将对应解释器路径导出：

```bash
export LOOMQ_SPINQ_PYTHON=/path/to/spinq-venv/bin/python
export LOOMQ_ORIGINQ_PYTHON=/path/to/originq-venv/bin/python
python evaluator.py --level l1 --target spinq,originq,braket --json-out report.json
```

`LOOMQ_SPINQ_PYTHON` 与 `LOOMQ_ORIGINQ_PYTHON` 分别指定 SpinQ 和 OriginQ Worker 的独立 Python 解释器。未设置时，Runner 会查找项目中的 `.venv-spinq`、`.venv-originq`，以及 Docker 中约定的 `/opt/...-venv` 路径；若仍未找到可用解释器，则明确报错。

## 已知限制

- 仅支持电路末尾的测量操作。
- pyQPanda 3.8.5 已验证于 Python 3.10/x86_64；其他平台需自行验证。
- SpinQit 传递依赖较大，干净 Docker 构建可能较慢。
- 当前只连接本地模拟器，不包含真机执行或证据。
