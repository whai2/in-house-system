FROM python:3.12-slim

WORKDIR /app

# 시스템 패키지 설치 (Node.js for MCP)
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# uv 설치
RUN pip install uv

# 의존성 파일 복사
COPY pyproject.toml uv.lock ./

# 의존성 설치
RUN uv sync --frozen

# 소스 코드 복사
COPY . .

# 포트 노출
EXPOSE 8000

# 서버 실행
CMD ["uv", "run", "python", "main.py"]
