FROM python:3.10-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace/submission

COPY requirements.txt requirements-spinq.txt ./

RUN pip install --no-cache-dir -r requirements.txt

# SpinQit 与 Braket 依赖不同 ANTLR 版本，使用独立虚拟环境。
RUN python -m venv /opt/spinq-venv \
    && /opt/spinq-venv/bin/pip install --no-cache-dir \
       -r requirements-spinq.txt

ENV LOOMQ_SPINQ_PYTHON=/opt/spinq-venv/bin/python

COPY . .

CMD ["python","evaluator.py","--level", "l1",  "--target","spinq,braket","--json-out","/tmp/loomq-public-report.json"]