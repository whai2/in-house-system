from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load environment variables
env_path = Path(".") / ".env"
load_dotenv(dotenv_path=env_path)

from app.domains.clickup_demo.routers import clickup_demo_router
from app.domains.clickup_demo.container.container import ClickUpDemoContainer
from app.common.database.mongodb import connect_to_mongo, close_mongo_connection


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    # MongoDB 연결
    await connect_to_mongo()

    container = ClickUpDemoContainer()
    app.container = container
    container.wire(modules=["app.domains.clickup_demo.apis.clickup_apis"])

    # ClickUp Agent 초기화
    agent = container.clickup_agent()
    await agent.initialize()

    yield

    # Shutdown
    # MCP 클라이언트 종료
    try:
        mcp_client = container.mcp_client()
        if mcp_client:
            await mcp_client.close()
    except Exception as e:
        # 종료 중 에러는 로깅만 하고 계속 진행
        print(f"Warning: Error closing MCP client: {e}")

    # MongoDB 연결 종료
    await close_mongo_connection()


app = FastAPI(
    title="In-House System Backend",
    description="FastAPI backend with ClickUp integration",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 설정 추가
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 환경에서는 모든 origin 허용
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ClickUp Demo Router 추가
app.include_router(clickup_demo_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"message": "In-House System Backend API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
