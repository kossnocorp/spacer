"""Ensure recovery cannot silently reopen test data with a different plan."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import finalize_lines_mixed as evaluation
from lines_mixed import sha


class FrozenEvaluationTests(unittest.TestCase):
    def test_completed_evaluation_does_not_open_dataset(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "held-out.json").write_text('{"complete": true}')
            with patch.multiple(evaluation, ROOT=root, REPORT=root), patch.object(evaluation, "rows_for") as rows:
                evaluation.main()
                rows.assert_not_called()

    def test_changed_frozen_plan_is_rejected_before_test_access(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            report, data, reference = [root / name for name in ["report", "data", "reference"]]
            for path in [report, data, reference]:
                path.mkdir()
            (data / "manifest.json").write_text('{}')
            (reference / "best.pt").write_bytes(b"reference")
            manifest_hash = sha(data / "manifest.json")
            (reference / "config.json").write_text(json.dumps(dict(encodedManifestSha256=manifest_hash, validation=dict(threshold=.52))))
            candidates = []
            for name in ["context-dilated-seed42", "baseline-seed42", "context-dilated-seed123"]:
                path = root / name
                path.mkdir()
                (path / "best.pt").write_bytes(name.encode())
                config = dict(weightsSha256=sha(path / "best.pt"), spec={}, validation=dict(overall=dict(threshold=.52)))
                (path / "config.json").write_text(json.dumps(config))
                candidates.append((path, config))
            (report / "complete.json").write_text(json.dumps(dict(primary=str(candidates[0][0]), confirmation=str(candidates[2][0]))))
            (report / "selection.json").write_text(json.dumps(dict(primary=candidates[0][1], protocol=dict(
                encodedManifestSha256=manifest_hash, referenceWeightsSha256=sha(reference / "best.pt")))))
            (data / "TEST-OPENED-lines-mixed-v1.json").write_text('{"different": "frozen plan"}')
            with patch.multiple(evaluation, ROOT=root, REPORT=report, DATA=data, REFERENCE=reference), patch.object(evaluation, "rows_for") as rows:
                with self.assertRaisesRegex(ValueError, "Frozen evaluation changed"):
                    evaluation.main()
                rows.assert_not_called()


if __name__ == "__main__":
    unittest.main()
