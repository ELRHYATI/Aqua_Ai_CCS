#!/usr/bin/env python3
"""
Télécharge le modèle Xenova/DialoGPT-small depuis Hugging Face
vers frontend/public/models/Xenova/DialoGPT-small/ pour usage local.

Usage:
  pip install huggingface_hub
  python scripts/download_dialogpt_model.py
"""

import sys
from pathlib import Path

# Chemin vers public du frontend (depuis backend/scripts/)
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent
TARGET_DIR = PROJECT_ROOT / "frontend" / "public" / "models" / "Xenova" / "DialoGPT-small"


def main():
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("Installez huggingface_hub: pip install huggingface_hub")
        sys.exit(1)

    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Téléchargement de Xenova/DialoGPT-small vers {TARGET_DIR}...")

    snapshot_download(
        repo_id="Xenova/DialoGPT-small",
        local_dir=str(TARGET_DIR),
        local_dir_use_symlinks=False,
    )

    print("Modèle téléchargé. Les fichiers sont dans:")
    for f in sorted(TARGET_DIR.iterdir()):
        size = f.stat().st_size / (1024 * 1024)
        print(f"  - {f.name} ({size:.1f} MB)")


if __name__ == "__main__":
    main()
