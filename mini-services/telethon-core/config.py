import os
from dataclasses import dataclass

@dataclass(frozen=True)
class Settings:
    api_id: int
    api_hash: str
    bot_token: str
    session_path: str
    storage_chat_id: int
    internal_key: str
    max_concurrent_uploads: int
    max_upload_bytes: int
    port: int

def get_settings() -> Settings:
    api_id_raw = os.getenv("TELETHON_API_ID", os.getenv("TELEGRAM_API_ID", "0")).strip()
    try:
        api_id = int(api_id_raw)
    except ValueError:
        raise ValueError("TELETHON_API_ID must be a valid integer")

    api_hash = os.getenv("TELETHON_API_HASH", os.getenv("TELEGRAM_API_HASH", "")).strip()
    bot_token = os.getenv("TELETHON_BOT_TOKEN", os.getenv("TELEGRAM_BOT_TOKEN", "")).strip()
    session_path = os.getenv("TELETHON_SESSION_PATH", "/app/db/telethon.session").strip()

    chat_id_raw = os.getenv("TELETHON_STORAGE_CHAT_ID", os.getenv("TELEGRAM_STORAGE_CHAT_ID", "0")).strip()
    try:
        storage_chat_id = int(chat_id_raw)
    except ValueError:
        storage_chat_id = 0

    internal_key = os.getenv("TELETHON_INTERNAL_KEY", "vs-telethon-internal-key").strip()

    try:
        max_concurrent_uploads = int(os.getenv("TELETHON_MAX_CONCURRENT_UPLOADS", "1"))
    except ValueError:
        max_concurrent_uploads = 1

    try:
        max_upload_bytes = int(os.getenv("MAX_UPLOAD_BYTES", "2000000000"))
    except ValueError:
        max_upload_bytes = 2_000_000_000

    try:
        port = int(os.getenv("PORT", "3005"))
    except ValueError:
        port = 3005

    return Settings(
        api_id=api_id,
        api_hash=api_hash,
        bot_token=bot_token,
        session_path=session_path,
        storage_chat_id=storage_chat_id,
        internal_key=internal_key,
        max_concurrent_uploads=max_concurrent_uploads,
        max_upload_bytes=max_upload_bytes,
        port=port,
    )
