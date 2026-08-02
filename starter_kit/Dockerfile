FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# pyqpanda 依赖 libcurl.so.4
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/submission
COPY requirements.txt requirements-spinq.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# SpinQit 与 Braket 依赖不同 ANTLR 版本，必须使用完全独立的虚拟环境。
RUN python -m venv /opt/spinq-venv \
    && /opt/spinq-venv/bin/pip install --no-cache-dir \
       -r requirements-spinq.txt

ENV LOOMQ_SPINQ_PYTHON=/opt/spinq-venv/bin/python

COPY . .

CMD ["python", "evaluator.py", "--json-out", "/tmp/loomq-public-report.json"]
