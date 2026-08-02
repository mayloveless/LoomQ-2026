FROM python:3.10-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace/submission

COPY requirements.txt requirements-spinq.txt requirements-originq.txt ./

# pyQPanda 的 manylinux wheel 在 slim 镜像中仍需要 libcurl.so.4。
RUN apt-get update \
    && apt-get install -y --no-install-recommends libcurl4 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir -r requirements.txt

# SpinQit 与 Braket 依赖不同 ANTLR 版本，使用独立虚拟环境。
RUN python -m venv /opt/spinq-venv \
    && /opt/spinq-venv/bin/pip install --no-cache-dir \
       -r requirements-spinq.txt

# pyQPanda 带原生动态库，使用独立解释器与主 Braket 环境隔离。
RUN python -m venv /opt/originq-venv \
    && /opt/originq-venv/bin/pip install --no-cache-dir \
       -r requirements-originq.txt

ENV LOOMQ_SPINQ_PYTHON=/opt/spinq-venv/bin/python \
    LOOMQ_ORIGINQ_PYTHON=/opt/originq-venv/bin/python

COPY . .

CMD ["python","evaluator.py","--level","l1","--target","spinq,originq,braket","--json-out","/tmp/loomq-public-report.json"]
