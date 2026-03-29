"""
Test the fine-tuned DialoGPT-small model for AZURA AQUA.
Uses temperature=0.7 and repetition_penalty=1.3 for generation.
Usage: python test_model.py
      python test_model.py "Votre question"
"""

import sys
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_PATH = "./azura-dialogpt-finetuned"
FALLBACK_MODEL = "microsoft/DialoGPT-small"
MAX_NEW_TOKENS = 120
TEMPERATURE = 0.7
REPETITION_PENALTY = 1.3


def load_model_and_tokenizer():
    """Load fine-tuned model if available, else base DialoGPT-small."""
    path = Path(MODEL_PATH)
    if path.exists() and (path / "config.json").exists():
        print(f"Loading fine-tuned model from {path}")
        tokenizer = AutoTokenizer.from_pretrained(path)
        model = AutoModelForCausalLM.from_pretrained(path)
    else:
        print(f"Fine-tuned model not found at {path}. Using base model: {FALLBACK_MODEL}")
        tokenizer = AutoTokenizer.from_pretrained(FALLBACK_MODEL)
        model = AutoModelForCausalLM.from_pretrained(FALLBACK_MODEL)

    tokenizer.pad_token = tokenizer.eos_token
    model.config.pad_token_id = tokenizer.eos_token_id

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = model.to(device)
    return model, tokenizer, device


def generate_response(model, tokenizer, device, user_input: str) -> str:
    """Generate response with temperature=0.7 and repetition_penalty=1.3."""
    input_text = user_input.strip() + tokenizer.eos_token
    input_ids = tokenizer.encode(input_text, return_tensors="pt").to(device)

    with torch.no_grad():
        output = model.generate(
            input_ids,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=True,
            temperature=TEMPERATURE,
            repetition_penalty=REPETITION_PENALTY,
            top_k=50,
            top_p=0.9,
            pad_token_id=tokenizer.eos_token_id,
        )

    # Decode only the generated part (exclude input)
    reply = tokenizer.decode(output[:, input_ids.shape[-1] :][0], skip_special_tokens=True)
    return reply.strip()


def main():
    model, tokenizer, device = load_model_and_tokenizer()

    # Default test questions if none provided
    default_questions = [
        "Quelle est la biomasse totale aujourd'hui ?",
        "Montre les anomalies Estran",
        "Résumé des DA en attente",
        "Combien de DA sont en cours ?",
        "Quel est le taux de recapture du parc P7 ?",
        "Bonjour",
    ]

    if len(sys.argv) > 1:
        questions = [" ".join(sys.argv[1:])]
    else:
        questions = default_questions

    print("\n--- AZURA AQUA — Test du modèle ---\n")
    for q in questions:
        reply = generate_response(model, tokenizer, device, q)
        print(f"Q: {q}")
        print(f"A: {reply}\n")

    # Interactive mode hint
    print("Pour tester une question personnalisée : python test_model.py \"Votre question\"")


if __name__ == "__main__":
    main()
