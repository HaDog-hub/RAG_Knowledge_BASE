from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    openai_api_key: str = Field(..., env="OPENAI_API_KEY")

    chroma_persist_dir: str = Field("./chroma_db", env="CHROMA_PERSIST_DIR")
    collection_name: str = Field("knowledge_base", env="COLLECTION_NAME")

    embedding_model: str = Field("text-embedding-3-small", env="EMBEDDING_MODEL")
    llm_model: str = Field("gpt-4o-mini", env="LLM_MODEL")

    chunk_size: int = Field(1000, env="CHUNK_SIZE")
    chunk_overlap: int = Field(200, env="CHUNK_OVERLAP")
    retrieval_top_files: int = Field(8, env="RETRIEVAL_TOP_FILES")

    # Comma-separated string, e.g. "http://localhost:3000,https://example.com"
    cors_origins: str = Field("http://localhost:3000", env="CORS_ORIGINS")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    # Auth
    jwt_secret_key: str = Field(..., env="JWT_SECRET_KEY")
    jwt_algorithm: str = Field("HS256", env="JWT_ALGORITHM")
    jwt_expire_days: int = Field(7, env="JWT_EXPIRE_DAYS")
    sqlite_url: str = Field("sqlite:///./users.db", env="SQLITE_URL")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
