"""Pydantic Settings for configuration."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/azura_aqua"
    # Chatbot read-only (optional): use chatbot_ro role with SELECT on estran_summary, finance_kpi_public, achat_status
    chatbot_database_url: str = ""

    # Azure OpenAI (GPT-4, GPT-4.1 / o1, gpt-4-turbo)
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    # Deployment name in Azure Portal (e.g. gpt-4, gpt-4.1, gpt-4o, gpt-4-turbo)
    azure_openai_deployment_name: str = "gpt-4"
    azure_openai_api_version: str = "2024-08-01-preview"

    # OneDrive for Business (Excel source - Microsoft Graph API)
    azure_ad_tenant_id: str = ""
    azure_ad_client_id: str = ""
    azure_ad_client_secret: str = ""
    # OneDrive path to main Excel file (e.g. Azura Aqua/REFLEXION.xlsx)
    onedrive_excel_path: str = "REFLEXION.xlsx"
    # Or use drive item ID directly (skip path lookup)
    onedrive_excel_item_id: str = ""
    # For app-only auth: user Object ID whose OneDrive to access (REQUIRED with client credentials)
    onedrive_user_id: str = ""
    # Local fallback: path to REFLEXION.xlsx when OneDrive not configured (e.g. ./REFLEXION.xlsx)
    excel_local_path: str = ""

    # Azure AI Search (On Your Data - indexed Excel / Power BI)
    azure_search_endpoint: str = ""
    azure_search_key: str = ""
    azure_search_index_name: str = "azura-finance-estrans"

    # Copilot (M365 Copilot / Copilot Studio - optional)
    copilot_studio_web_app_url: str = ""

    # LLM Tools: when True and Azure OpenAI configured, use function calling instead of keyword matching
    # See docs/LLM_INTEGRATION_GUIDE.md
    use_llm_tools: bool = False

    # Ollama (local LLM - see docs/LLM_INTEGRATION_GUIDE.md Option C)
    ollama_enabled: bool = True
    ollama_url: str = "http://localhost:11434"
    ollama_base_url: str = "http://localhost:11434"  # alias for ollama_url
    ollama_model: str = "mistral:7b"

    # Auth: False = JWT required; True = dev mode (X-User-Id header, no privilege enforcement for anonymous)
    auth_disabled: bool = False
    jwt_secret: str = "change-me-set-JWT_SECRET-in-production"  # env: JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # App
    app_name: str = "AZURA AQUA"
    debug: bool = False
    frontend_url: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
