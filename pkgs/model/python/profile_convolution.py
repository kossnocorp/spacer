"""Synthetic GPU backend timing/parity; never reads training or held-out data."""
import json
import time
import torch
from tune import ContextCNN, DEEP

torch.set_num_threads(8)
torch.cuda.set_device(0)
torch.manual_seed(42)
x = torch.randint(0, 512, (512, 256), dtype=torch.int32, device="cuda")
native = ContextCNN(512, DEEP).cuda().eval()
expanded = ContextCNN(512, DEEP, "expanded").cuda().eval()
expanded.load_state_dict(native.state_dict())
results = {}
for name, model in [("native", native), ("expanded", expanded)]:
    print(f"Profiling {name}: batch=512, warmup then 10 forward/backward steps", flush=True)
    model(x).mean().backward()
    torch.cuda.synchronize()
    started = time.monotonic()
    for _ in range(10):
        model.zero_grad(set_to_none=True)
        output = model(x)
        output.mean().backward()
    torch.cuda.synchronize()
    results[name] = dict(secondsPerStep=(time.monotonic()-started)/10)
    print(name, results[name], flush=True)
with torch.no_grad():
    results["maxLogitError"] = float((native(x)-expanded(x)).abs().max())
results["maxGradientError"] = max(float((a.grad-b.grad).abs().max()) for a,b in zip(native.parameters(),expanded.parameters()))
torch.testing.assert_close(native(x),expanded(x),atol=1e-5,rtol=1e-4)
for a,b in zip(native.parameters(),expanded.parameters()):
    torch.testing.assert_close(a.grad,b.grad,atol=1e-5,rtol=1e-3)
print(json.dumps(results,indent=2), flush=True)
