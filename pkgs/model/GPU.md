# Radeon GPU training

Working on this machine: **RX 7900 XTX (gfx1100, 24 GB), Fedora 44, ROCm 7.1.1**, using **PyTorch 2.10.0+rocm7.1 / Python 3.12**. Forward pass, embedding/convolution backpropagation, optimizer updates, full corpus training, and export to TypeScript inference have all passed.

The official TensorFlow.js native GPU package requires NVIDIA CUDA. We use a Python/ROCm training worker with TypeScript corpus generation, LLM tokenization, orchestration, evaluation, and inference.

## Setup and commands

From the workspace root:

```sh
mise install
mise exec -- uv sync --project pkgs/model --frozen
mise exec -- node pkgs/model/src/rocm.ts smoke

# Use a new output directory for each run.
mise exec -- node pkgs/model/src/rocm.ts train \
  --data tmp/model-encoded --out tmp/model-rocm-next

# Evaluate only after validation has selected the checkpoint and threshold.
mise exec -- node pkgs/model/src/evaluate.ts --model tmp/model-rocm-next
mise exec -- node pkgs/model/src/format.ts ./your-directory --model tmp/model-rocm-next --check
```

`mise use uv` was run; `mise.toml` includes uv. Dependencies are locked in `uv.lock` and installed in `pkgs/model/.venv`. The PyTorch wheel download is approximately 5 GB.

The trainer defaults to five epochs, batch size 512, patience two, seed 42. It opens only the train and validation binaries. GPU selection prefers the 7900 XTX name or `gfx1100`; use `--device INDEX` to override. PyTorch's `torch.cuda` namespace also serves AMD HIP devices.

The wheel reports this GPU as `AMD Radeon Graphics` because `/opt/amdgpu/share/libdrm/amdgpu.ids` is missing. Selection uses its architecture and logs its 24 GB VRAM; this naming warning did not prevent training. The integrated GPU is `gfx1036`.

## Export and results

`src/rocm.ts` launches `python/worker.py`, then converts the selected weights into `best/model.json` and binary weights for the existing TypeScript formatter. Eight examples verify PyTorch/TFJS prediction parity before the output's `INCOMPLETE` marker is removed. If export is interrupted, retry with:

```sh
mise exec -- node pkgs/model/src/rocm.ts export --out tmp/model-rocm-next
```

The first GPU run took **67.4 seconds** for four epochs and validation/selection; individual epochs including validation took **16–18 seconds**, versus **142–146 seconds** with native CPU TensorFlow. This is roughly **8× faster per epoch** for these implementations, not a controlled hardware-only benchmark.

Frozen-model test accuracy was **94.79%**, F1 **89.62%**, on 225,816 held-out boundaries. Export maximum probability difference was **2.09e-7**. Full results: [RESULTS.md](RESULTS.md).

The workspace carries a small pnpm patch replacing removed Node `util.isNullOrUndefined` / `util.isArray` calls in TensorFlow.js 4.22.0, enabling inference/export with the configured Node 26.

ROCm device access requires `/dev/kfd` and `/dev/dri`. They were already available on this host. This configuration was verified directly on Fedora; AMD's official supported-OS matrix is separate from this observed result.

Sources: [PyTorch ROCm wheels](https://download.pytorch.org/whl/rocm7.1/torch/), [AMD ROCm documentation](https://rocm.docs.amd.com/en/latest/), [TensorFlow.js WebGPU limitations](https://github.com/tensorflow/tfjs/tree/master/tfjs-backend-webgpu).
