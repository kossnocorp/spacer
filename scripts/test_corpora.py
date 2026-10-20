import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import corpora


class CleanupTests(unittest.TestCase):
    def test_clean_preserves_source_bytes_and_audits_binary_extensions(self):
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            previous = corpora.CORPORA
            corpora.CORPORA = Path(directory)
            try:
                root = Path(directory) / "example-v1"
                (root / "repos/owner--repo").mkdir(parents=True)
                (root / "licenses").mkdir()
                corpora.dump(root / "selection.json", {"frozen": True})
                corpora.dump(root / "manifest.json", {"id": "example-v1", "files": 3, "repositories": 1})
                sources = {"code.ts": b"const x = 1;\n\nconsole.log(x);\n", "video.ts": bytes([0x47]) + bytes(187)}
                sources["video.ts"] *= 4
                sources["invalid.rs"] = b"\xffinvalid"
                records = []
                for name, data in sources.items():
                    path = f"repos/owner--repo/{name}"
                    (root / path).write_bytes(data)
                    records.append({"path": path, "sha256": hashlib.sha256(data).hexdigest()})
                (root / "files.jsonl").write_text("".join(json.dumps(row) + "\n" for row in records))
                corpora.dump(root / "provenance/owner--repo.json", {"commit": "pinned", "files": records})
                corpora.clean("example-v1", "example-v2")
                target = Path(directory) / "example-v2"
                self.assertEqual((target / "repos/owner--repo/code.ts").read_bytes(), sources["code.ts"])
                self.assertTrue((root / "repos/owner--repo/video.ts").exists())
                self.assertFalse((target / "repos/owner--repo/video.ts").exists())
                audit = json.loads((target / "excluded-binary.json").read_text())
                self.assertEqual(len(audit), 2)
                self.assertIn("MPEG", audit[0]["reason"])
                self.assertEqual(json.loads((target / "manifest.json").read_text())["files"], 1)
                with self.assertRaises(FileExistsError):
                    corpora.clean("example-v1", "example-v2")
            finally:
                corpora.CORPORA = previous


if __name__ == "__main__":
    unittest.main()
