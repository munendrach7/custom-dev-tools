FROM python:3.12-slim

WORKDIR /app

# Allow overriding the pip index (e.g. a corporate mirror) at build time.
ARG PIP_INDEX_URL=""
ENV PIP_INDEX_URL=${PIP_INDEX_URL}

# System deps kept minimal; wheels cover bcrypt/cryptography on slim.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV DATA_DIR=/data
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
