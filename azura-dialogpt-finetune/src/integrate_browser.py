"""
Export fine-tuned DialoGPT to ONNX for Transformers.js browser usage.
Also pushes to HuggingFace Hub (optional) for direct use with @xenova/transformers.

Usage:
  python src/integrate_browser.py
  python src/integrate_browser.py --push --repo your-username/azura-dialogpt
"""

import argparse
import shutil
from pathlib import Path

MODEL_DIR = Path("./azura-dialogpt")
ONNX_DIR = Path("./azura-dialogpt-onnx")


def export_onnx():
    """Export to ONNX using optimum."""
    print("Exporting to ONNX...")

    if not MODEL_DIR.exists():
        print(f"Model not found at {MODEL_DIR}. Run train_azura.py first.")
        return False

    try:
        from optimum.onnxruntime import ORTModelForCausalLM
        from transformers import AutoTokenizer

        print(f"Loading model from {MODEL_DIR}")
        model = ORTModelForCausalLM.from_pretrained(MODEL_DIR, export=True)
        tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)

        print(f"Saving ONNX to {ONNX_DIR}")
        model.save_pretrained(ONNX_DIR)
        tokenizer.save_pretrained(ONNX_DIR)

        print(f"ONNX model saved to {ONNX_DIR}")
        return True

    except ImportError:
        print("Install optimum: pip install optimum[onnxruntime]")
        return False


def push_to_hub(repo_id: str):
    """Push ONNX model to HuggingFace Hub for Transformers.js usage."""
    print(f"Pushing to HuggingFace Hub: {repo_id}")

    try:
        from huggingface_hub import HfApi
        api = HfApi()

        source = ONNX_DIR if ONNX_DIR.exists() else MODEL_DIR
        api.upload_folder(
            folder_path=str(source),
            repo_id=repo_id,
            repo_type="model",
            commit_message="AZURA AQUA fine-tuned DialoGPT-small",
        )
        print(f"Pushed to: https://huggingface.co/{repo_id}")
        print(f"\nTo use in browser:\n  import {{ pipeline }} from '@xenova/transformers';")
        print(f"  const gen = await pipeline('text-generation', '{repo_id}');")

    except ImportError:
        print("Install: pip install huggingface_hub")
    except Exception as e:
        print(f"Error: {e}")
        print("Run: huggingface-cli login")


def print_integration_guide():
    print("\n" + "=" * 60)
    print("BROWSER INTEGRATION GUIDE")
    print("=" * 60)
    print("""
1. Push model to HuggingFace Hub:
   python src/integrate_browser.py --push --repo YOUR_USER/azura-dialogpt

2. In frontend/src/lib/localLLM.ts, change MODEL_ID:
   const MODEL_ID = 'YOUR_USER/azura-dialogpt'

3. The model will auto-download in the browser on first use.

Alternative (no Hub):
   - Copy ONNX files to frontend/public/models/azura-dialogpt/
   - Use local path in MODEL_ID

Model size: ~150MB (ONNX quantized) vs ~500MB (PyTorch)
""")


def main():
    parser = argparse.ArgumentParser(description="Export AZURA DialoGPT for browser")
    parser.add_argument("--push", action="store_true", help="Push to HuggingFace Hub")
    parser.add_argument("--repo", type=str, default="", help="HF repo ID (e.g. user/azura-dialogpt)")
    args = parser.parse_args()

    success = export_onnx()

    if args.push and args.repo:
        push_to_hub(args.repo)
    elif args.push:
        print("Specify --repo YOUR_USER/azura-dialogpt")

    print_integration_guide()


if __name__ == "__main__":
    main()
