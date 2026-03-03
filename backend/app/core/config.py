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

    # App
    app_name: str = "AZURA AQUA"
    debug: bool = False


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
