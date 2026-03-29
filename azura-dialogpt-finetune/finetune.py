"""
Fine-tune microsoft/DialoGPT-small on AZURA AQUA Q&A pairs.
Training data format: {"context": "user question", "response": "bot answer"}
Usage: python finetune.py
GPU recommended. CPU works but slower.
"""

import json
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
OUTPUT_DIR = "./azura-dialogpt-finetuned"
DATA_PATH = Path(__file__).resolve().parent / "data" / "train.json"

MAX_LENGTH = 256
EPOCHS = 4
BATCH_SIZE = 4
LEARNING_RATE = 5e-5
WARMUP_STEPS = 20
WEIGHT_DECAY = 0.01


def main():
    if not DATA_PATH.exists():
        print(f"Dataset not found at {DATA_PATH}")
        sys.exit(1)

    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)

    if not all("context" in d and "response" in d for d in data):
        print("Each item in train.json must have 'context' and 'response' keys")
        sys.exit(1)

    print(f"Loading model: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForCausalLM.from_pretrained(MODEL_NAME)

    tokenizer.pad_token = tokenizer.eos_token
    model.config.pad_token_id = tokenizer.eos_token_id

    # Build dataset with context/response
    contexts = [d["context"] for d in data]
    responses = [d["response"] for d in data]

    dataset = Dataset.from_dict({"context": contexts, "response": responses})
    print(f"Dataset size: {len(dataset)} Q&A pairs")

    def tokenize_conversation(examples):
        """Format: <context> <EOS> <response> <EOS>"""
        texts = []
        for ctx, resp in zip(examples["context"], examples["response"]):
            text = f"{ctx}{tokenizer.eos_token}{resp}{tokenizer.eos_token}"
            texts.append(text)

        tokenized = tokenizer(
            texts,
            truncation=True,
            padding="max_length",
            max_length=MAX_LENGTH,
            return_tensors="pt",
        )

        tokenized["labels"] = tokenized["input_ids"].clone()
        tokenized["labels"][tokenized["labels"] == tokenizer.pad_token_id] = -100

        return tokenized

    print("Tokenizing dataset...")
    tokenized_dataset = dataset.map(
        tokenize_conversation,
        batched=True,
        batch_size=32,
        remove_columns=dataset.column_names,
    )

    split = tokenized_dataset.train_test_split(test_size=0.15, seed=42)
    train_dataset = split["train"]
    eval_dataset = split["test"]
    print(f"Train: {len(train_dataset)}, Eval: {len(eval_dataset)}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        learning_rate=LEARNING_RATE,
        warmup_steps=WARMUP_STEPS,
        weight_decay=WEIGHT_DECAY,
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        fp16=torch.cuda.is_available(),
        report_to="none",
        seed=42,
    )

    data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

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
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

    print("\n--- Eval ---")
    results = trainer.evaluate()
    print(f"Eval loss: {results['eval_loss']:.4f}")
    print(f"Perplexity: {torch.exp(torch.tensor(results['eval_loss'])):.2f}")

    print("\n--- Quick test ---")
    model.eval()
    test_questions = ["Quelle est la biomasse totale aujourd'hui ?", "Combien de DA sont en cours ?"]
    for q in test_questions:
        input_ids = tokenizer.encode(q + tokenizer.eos_token, return_tensors="pt").to(device)
        with torch.no_grad():
            output = model.generate(
                input_ids,
                max_new_tokens=80,
                do_sample=True,
                temperature=0.7,
                repetition_penalty=1.3,
                pad_token_id=tokenizer.eos_token_id,
            )
        reply = tokenizer.decode(output[:, input_ids.shape[-1] :][0], skip_special_tokens=True)
        print(f"  Q: {q}")
        print(f"  A: {reply}\n")

    print("Done! Model saved to:", Path(OUTPUT_DIR).resolve())


if __name__ == "__main__":
    main()
