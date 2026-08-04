FROM python:3.10-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace/submission

COPY requirements.txt requirements-spinq.txt requirements-originq.txt ./

# pyQPanda 的 manylinux wheel 在 slim 镜像中仍需要 libcurl.so.4。
# Debian HTTP 镜像偶发返回 502；改用 HTTPS，并对索引更新做有限重试。
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && set -eux; \
       apt_updated=0; \
       for attempt in 1 2 3 4 5; do \
           if apt-get update -o Acquire::Retries=5; then \
               apt_updated=1; \
               break; \
           fi; \
           rm -rf /var/lib/apt/lists/*; \
           sleep $((attempt * 2)); \
       done; \
       test "$apt_updated" -eq 1; \
       apt-get install -y --no-install-recommends -o Acquire::Retries=5 libcurl4; \
       rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
       --timeout 300 --retries 10 \
       -r requirements.txt

# SpinQit 与 Braket 依赖不同 ANTLR 版本，使用独立虚拟环境。
# SpinQit 未区分 CPU/GPU 的 torch 依赖；评测只使用本地模拟器，直接安装官方 CPU wheel，避免 CUDA/cuDNN/Triton 和额外索引解析问题。
RUN python -m venv /opt/spinq-venv \
    && /opt/spinq-venv/bin/pip install --no-cache-dir \
       --timeout 300 --retries 10 \
       "https://download-r2.pytorch.org/whl/cpu/torch-2.13.0%2Bcpu-cp310-cp310-manylinux_2_28_x86_64.whl" \
    && /opt/spinq-venv/bin/pip install --no-cache-dir \
       --timeout 300 --retries 10 \
       -r requirements-spinq.txt

# pyQPanda 带原生动态库，使用独立解释器与主 Braket 环境隔离。
RUN python -m venv /opt/originq-venv \
    && /opt/originq-venv/bin/pip install --no-cache-dir \
       --timeout 300 --retries 10 \
       -r requirements-originq.txt

ENV LOOMQ_SPINQ_PYTHON=/opt/spinq-venv/bin/python \
    LOOMQ_ORIGINQ_PYTHON=/opt/originq-venv/bin/python

COPY . .

CMD ["python","evaluator.py","--level","l1","--target","spinq,originq,braket","--json-out","/tmp/loomq-public-report.json"]
