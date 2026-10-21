"""Protect calibration and lexical-only input contracts without corpus access."""
import unittest

import numpy as np
import torch

from lines_mixed import LexicalCNN, SPECS, calibrate
from worker import measure


class MixedLinesTests(unittest.TestCase):
    def test_calibration_matches_exhaustive_grid_including_exact_boundaries(self):
        for seed in range(5):
            rng = np.random.default_rng(seed)
            scores = np.concatenate([rng.random(1000), np.arange(100, 901, 5)/1000]).astype(np.float32)
            labels = rng.integers(0, 2, len(scores))
            expected = max((measure(labels, scores, t/1000) for t in range(100, 901, 5)),
                           key=lambda m: (m["accuracy"], m["f1"]))
            self.assertEqual(calibrate(labels, scores), expected)

    def test_no_syntax_or_language_input_and_finite_gradients(self):
        torch.set_num_threads(2)
        for name, spec in SPECS.items():
            with self.subTest(name=name):
                model = LexicalCNN(spec).eval()
                rows = torch.randint(1, 512, (3, 387), dtype=torch.int32)
                changed = rows.clone()
                changed[:, 256:] = 0
                torch.testing.assert_close(model(rows), model(changed))
                torch.testing.assert_close(model(rows), model(rows[:, :256]))
                model(rows).sum().backward()
                self.assertTrue(all(p.grad is not None and torch.isfinite(p.grad).all() for p in model.parameters()))


if __name__ == "__main__":
    unittest.main()
