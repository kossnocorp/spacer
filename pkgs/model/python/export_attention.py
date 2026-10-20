"""Export the frozen seed-42 winner and training-only parity fixtures."""
import json
from pathlib import Path
import numpy as np
import torch
from research_v2 import CrossAttention, load

root = Path("tmp/research-v2-gpu/cross-attention-mixed-seed42")
out = Path("tmp/spacer-tree-sitter-cross-attention-1")
out.mkdir(exist_ok=False)
(out / "best").mkdir()
torch.set_num_threads(8)
model = CrossAttention().eval()
model.load_state_dict(torch.load(root / "best.pt", map_location="cpu", weights_only=True))
specs = []
with (out / "best/weights.bin").open("wb") as stream:
    for name, tensor in model.state_dict().items():
        values = tensor.detach().numpy().astype("<f4")
        specs.append({"name": name, "shape": list(values.shape)})
        stream.write(values.tobytes())
(out / "best/model.json").write_text(json.dumps(specs, indent=2))
data_root = Path("tmp/encoded-v2-teacher")
manifest = json.loads((data_root / "manifest.json").read_text())
data = load(data_root, "train", manifest, "mixed")
tokens = np.array(data[:64, :384], dtype=np.int32)
with torch.inference_mode():
    scores = model(torch.from_numpy(tokens)).sigmoid().tolist()
(out / "parity.json").write_text(json.dumps({"tokens": tokens.tolist(), "scores": scores}))
config = json.loads((root / "config.json").read_text())
config.update({"modelName": "spacer-tree-sitter-cross-attention-1", "threshold": config["validation"]["threshold"],
               "tokenizer": {"name": "spacer-lexical-tree-sitter", "schema": 1,
                   "lexical": {"name": "cl100k_base", "implementation": "gpt-tokenizer@3.4.0", "tokensPerSide": 128, "contextLines": 5},
                   "structural": {"name": "spacer-tree-sitter", "schema": 2, "tokensPerSide": 64}},
               "inferenceSchema": "spacer-cross-attention-1", "context": 5,
               "lexicalTokensPerSide": 128, "structuralTokensPerSide": 64,
               "sourceCheckpoint": str(root), "exportFormat": "float32 PyTorch-layout tensors for TFJS inference"})
(out / "config.json").write_text(json.dumps(config, indent=2))
print(f"Exported {out}")
