import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, ensure_indexes
from routers import auth, catalogos, dashboard, importacao, militares, relatorios, usuarios


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    yield
    client.close()


app = FastAPI(lifespan=lifespan, title="CBMMT — Gestão de Temporários")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "CBMMT Temporários API", "status": "ok"}


for r in (auth, catalogos, militares, dashboard, importacao, relatorios, usuarios):
    api_router.include_router(r.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Include the router in the main app — must stay last
app.include_router(api_router)
