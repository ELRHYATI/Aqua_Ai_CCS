# AZURA AQUA — Fine-tuning DialoGPT-small

Fine-tune `microsoft/DialoGPT-small` (124M params) sur conversations AZURA AQUA pour un chatbot aquaculture 100% local.

## Quickstart (finetune.py + train.json)

```bash
pip install -r requirements.txt

# 1. Fine-tuner sur les 30 Q&A de data/train.json
python finetune.py

# 2. Tester le modèle (temperature=0.7, repetition_penalty=1.3)
python test_model.py
python test_model.py "Quelle est la biomasse totale ?"
```

Le modèle fine-tuné est sauvegardé dans `./azura-dialogpt-finetuned/`.

## Alternative (dataset 1000 conversations)

```bash
# 1. Générer le dataset (1000 conversations)
python src/generate_dataset.py

# 2. Fine-tuner (GPU recommandé, ~20min sur T4)
python src/train_azura.py

# 3. Exporter en ONNX pour le navigateur
python src/integrate_browser.py
```

## Google Colab

Ouvrir `notebooks/colab_finetune_azura.ipynb` dans Colab avec GPU T4.

## Structure

```
azura-dialogpt-finetune/
├── data/
│   ├── train.json                   # 30 Q&A (context/response) pour finetune.py
│   ├── azura_conversations.csv      # 1000 paires prompt/response
│   └── azura_conversations.jsonl    # Format JSONL alternatif
├── finetune.py                      # Fine-tuning sur train.json → azura-dialogpt-finetuned/
├── test_model.py                    # Test avec temperature=0.7, repetition_penalty=1.3
├── notebooks/
│   └── colab_finetune_azura.ipynb   # Notebook Colab-ready
├── src/
│   ├── generate_dataset.py          # Génère le dataset
│   ├── train_azura.py               # Script de fine-tuning
│   └── integrate_browser.py         # Export ONNX + intégration
├── requirements.txt
└── README.md
```

## Résultat

- **finetune.py** → `./azura-dialogpt-finetuned/` (30 Q&A, format context/response)
- **train_azura.py** → `./azura-dialogpt/` (1000 conversations)
- Export ONNX → `./azura-dialogpt-onnx/` pour Transformers.js dans le navigateur
