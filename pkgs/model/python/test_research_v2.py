import tempfile
import unittest
from pathlib import Path

import torch
from research_v2 import Hybrid, Lines, CrossAttention


class HybridTests(unittest.TestCase):
    def test_attention_handles_padding_and_updates_both_streams(self):
        torch.manual_seed(42)
        model = CrossAttention()
        inputs = torch.randint(1, 512, (8, 384), dtype=torch.int32)
        inputs[:, :100] = 0
        scores = model(inputs)
        self.assertTrue(torch.isfinite(scores).all())
        scores.square().mean().backward()
        self.assertGreater(model.lexical.weight.grad.abs().sum().item(), 0)
        self.assertGreater(model.structural.weight.grad.abs().sum().item(), 0)

    def test_both_streams_train_and_reload(self):
        torch.set_num_threads(2)
        torch.manual_seed(42)
        model = Hybrid()
        inputs = torch.randint(1, 512, (8, 384), dtype=torch.int32)
        targets = torch.arange(8).remainder(2).float()
        loss = torch.nn.functional.binary_cross_entropy_with_logits(model(inputs), targets)
        loss.backward()
        for embedding in [model.lexical.embedding, model.structural.embedding]:
            self.assertTrue(torch.isfinite(embedding.weight.grad).all())
            self.assertGreater(embedding.weight.grad.abs().sum().item(), 0)
        model.eval()
        expected = model(inputs)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.pt"
            torch.save(model.state_dict(), path)
            restored = Hybrid().eval()
            restored.load_state_dict(torch.load(path, weights_only=True))
            torch.testing.assert_close(expected, restored(inputs))

    def test_lines_control_ignores_structural_stream(self):
        torch.manual_seed(42)
        model = Lines().eval()
        inputs = torch.randint(1, 512, (8, 384), dtype=torch.int32)
        changed = inputs.clone()
        changed[:, 256:] = 0
        torch.testing.assert_close(model(inputs), model(changed))


if __name__ == "__main__":
    unittest.main()
