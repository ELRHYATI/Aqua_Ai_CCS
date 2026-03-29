"""
Fine-tune DialoGPT-small on AZURA AQUA conversations.
Usage: python src/train_azura.py
GPU recommended (T4 ~20min, A100 ~5min). CPU works but slower (~2h).
"""

import os
import sys
from pathlib import Path

import torch
from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    DataCollatorForLanguageModeling,
)

MODEL_NAME = "microsoft/DialoGPT-small"
OUTPUT_DIR = "./azura-dialogpt"
DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "azura_conversations.csv"

MAX_LENGTH = 128
EPOCHS = 3
BATCH_SIZE = 8
LEARNING_RATE = 5e-5
WARMUP_STEPS = 100
WEIGHT_DECAY = 0.01


def main():
    if not DATA_PATH.exists():
        print(f"Dataset not found at {DATA_PATH}")
        print("Run: python src/generate_dataset.py")
        sys.exit(1)

    print(f"Loading model: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForCausalLM.from_pretrained(MODEL_NAME)

    tokenizer.pad_token = tokenizer.eos_token
    model.config.pad_token_id = tokenizer.eos_token_id

    print(f"Loading dataset: {DATA_PATH}")
    dataset = Dataset.from_csv(str(DATA_PATH))
    print(f"Dataset size: {len(dataset)} conversations")

    def tokenize_conversation(examples):
        """Format: <prompt> <EOS> <response> <EOS>"""
        texts = []
        for prompt, response in zip(examples["prompt"], examples["response"]):
            text = f"{prompt}{tokenizer.eos_token}{response}{tokenizer.eos_token}"
            texts.append(text)

        tokenized = tokenizer(
            texts,
            truncation=True,
            padding="max_length",
            max_length=MAX_LENGTH,
            return_tensors="pt",
        )

        tokenized["labels"] = tokenized["input_ids"].clone()
        # Mask padding tokens in labels (-100 = ignore in loss)
        tokenized["labels"][tokenized["labels"] == tokenizer.pad_token_id] = -100

        return tokenized

    print("Tokenizing dataset...")
    tokenized_dataset = dataset.map(
        tokenize_conversation,
        batched=True,
        batch_size=64,
        remove_columns=dataset.column_names,
    )

    split = tokenized_dataset.train_test_split(test_size=0.1, seed=42)
    train_dataset = split["train"]
    eval_dataset = split["test"]
    print(f"Train: {len(train_dataset)}, Eval: {len(eval_dataset)}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        overwrite_output_dir=True,
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        learning_rate=LEARNING_RATE,
        warmup_steps=WARMUP_STEPS,
        weight_decay=WEIGHT_DECAY,
        logging_steps=50,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        fp16=torch.cuda.is_available(),
        report_to="none",
        seed=42,
    )

    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=data_collator,
    )

    print("\n--- Starting fine-tuning ---")
    trainer.train()

    print(f"\nSaving model to {OUTPUT_DIR}")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

    print("\n--- Eval ---")
    results = trainer.evaluate()
    print(f"Eval loss: {results['eval_loss']:.4f}")
    print(f"Perplexity: {torch.exp(torch.tensor(results['eval_loss'])):.2f}")

    # Quick test
    print("\n--- Quick test ---")
    model.eval()
    test_prompts = [
        "Bonjour",
        "Combien de DA sont en cours ?",
        "Quel est le taux de recapture du parc P7 ?",
    ]
    for prompt in test_prompts:
        input_ids = tokenizer.encode(prompt + tokenizer.eos_token, return_tensors="pt").to(device)
        with torch.no_grad():
            output = model.generate(
                input_ids,
                max_new_tokens=80,
                do_sample=True,
                temperature=0.7,
                top_k=50,
                top_p=0.9,
                pad_token_id=tokenizer.eos_token_id,
            )
        response = tokenizer.decode(output[:, input_ids.shape[-1]:][0], skip_special_tokens=True)
        print(f"  Q: {prompt}")
        print(f"  A: {response}\n")

    print("Done! Model saved to:", os.path.abspath(OUTPUT_DIR))


if __name__ == "__main__":
    main()
