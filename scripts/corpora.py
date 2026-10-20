"""Reproducible, resumable corpus collection and checksum-verified R2 transport."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CORPORA = ROOT / "corpora"
ACCOUNT = "a882f484593b0536f22686b11f8ccc05"
BUCKET = "spacer-models"
TEACHER = "jev-typescript-ordered-v1"
TS = {".ts", ".tsx", ".mts", ".cts"}


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def cf(*args, **kwargs):
    # Apply the account after fnox: a local secret currently overrides the ID.
    for attempt in range(4):
        try:
            output = kwargs.get("stdout")
            if hasattr(output, "seek"):
                output.seek(0)
                output.truncate()
            return run("fnox", "exec", "--", "env", f"CLOUDFLARE_ACCOUNT_ID={ACCOUNT}",
                       "cf", "r2", "objects", *args, "--bucket-name", BUCKET, **kwargs)
        except subprocess.CalledProcessError:
            if attempt == 3:
                raise
            print(f"Retrying R2 {args[0]} after request failure", flush=True)
            time.sleep(2 ** attempt)


def upload(key, path):
    cf("put", key, "--file", path, "--content-length", path.stat().st_size,
       "--content-type", "application/json" if path.suffix == ".json" else "application/octet-stream",
       stdout=subprocess.DEVNULL)


def download(key, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as output:
        cf("get", key, stdout=output)


def safe_id(value):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", value):
        raise ValueError("Corpus ID must be lowercase letters, digits, hyphens")
    return value


def readme(root, text):
    (root / "README.md").write_text(f"# {root.name}\n\n{text}\n\n"
        "## Archive and fetch\n\nFrom the spacer repository root:\n\n```sh\n"
        f"mise run corpus:archive -- {root.name}\n"
        f"mise run corpus:fetch -- {root.name}\n```\n\n"
        "Archives use zipper 0.1.178 TAR/Zstandard, split into 200 MiB transport parts. "
        "SHA-256 validates each part and the combined archive; source hashes are in files.jsonl. "
        "The remote archive manifest is published last. Upstream licenses are preserved under licenses/.\n")


def teacher():
    root = CORPORA / TEACHER
    root.mkdir(parents=True, exist_ok=True)
    (root / "INCOMPLETE").touch()
    dataset = ROOT / "tmp/model-corpus-ordered"
    evidence = ROOT / "tmp/full-run-ordered"
    manifest = json.loads((dataset / "manifest.json").read_text())
    audit = []
    progress = {}
    for source in manifest["sources"]:
        slug = source["repo"].replace("/", "--")
        records = {}
        for line in (evidence / f"{slug}.progress.jsonl").open():
            row = json.loads(line)
            if not row.get("error"):
                records[row["path"]] = row
        progress[slug] = records
        for name in [f"{slug}.baseline.json", f"{slug}.progress.jsonl"]:
            target = root / "evidence" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(evidence / name, target)
        repo = ROOT / "tmp" / slug
        for license in repo.glob("*"):
            if license.is_file() and license.name.upper().startswith(("LICENSE", "COPYING", "NOTICE")):
                target = root / "licenses" / slug / license.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(license, target)
    with (root / "files.jsonl").open("w") as output:
        for line in (dataset / "files.jsonl").open():
            row = json.loads(line)
            owner, repo, relative = row["file"].split("/", 2)
            slug = f"{owner}--{repo}"
            if Path(relative).suffix not in TS:
                raise ValueError(f"Unexpected non-TypeScript admitted file: {relative}")
            record = progress[slug].get(relative)
            if not record or record["questions"] != row["boundaries"] or len(record.get("probabilities", {})) != row["boundaries"]:
                raise ValueError(f"Incomplete Jev evidence: {row['file']}")
            source = ROOT / "tmp" / slug / relative
            if sha(source) != row["afterHash"]:
                raise ValueError(f"Changed teacher source: {source}")
            target = root / "repos" / slug / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            output.write(json.dumps({**row, "path": str(target.relative_to(root))}) + "\n")
            audit.append(row["file"])
            if len(audit) % 5000 == 0:
                print(f"Verified {len(audit)} completed TS files", flush=True)
    # Preserve exact labels/splits and the run implementation/config for reproduction.
    shutil.copytree(dataset, root / "dataset", dirs_exist_ok=True)
    shutil.copytree(ROOT / "pkgs/playground/src", root / "preparation-src", dirs_exist_ok=True)
    readme(root, f"{len(audit):,} hash-verified TypeScript/TSX/MTS/CTS files from {len(manifest['sources'])} repositories.\n\n"
        "Only files admitted in dataset/files.jsonl are included. Each has a successful Jev progress record, "
        "the recorded number of probabilities, and an exact afterHash match. Non-TS files, unprocessed files, "
        "git databases and build dependencies are absent from repos/. Evidence is retained separately.\n\n"
        "Labels are actual blank lines in the completed after-state, not thresholded probabilities. "
        "The existing 70/15/15 normalized-file-group split and deduplication are retained verbatim.\n\n"
        "## Reproduce\n\n`mise run corpus:teacher` audits tmp/model-corpus-ordered and tmp/full-run-ordered "
        "against tmp/<owner>--<repo> checkouts. Fetching this archive reproduces the exact training inputs. "
        "To regenerate upstream inputs, clone each repository and checkout the upstream commit in evidence/*.baseline.json; "
        "those manifests also identify the local normalized baseline. Apply the original preparation pipeline "
        "(snapshot in preparation-src/), then replay stored Jev decisions. A fresh Jev call may differ and incurs API charges; "
        "no such calls are made by these management tasks. Dataset manifest records the label/split rules.\n")
    dump(root / "manifest.json", {"id": TEACHER, "files": len(audit), "repositories": len(manifest["sources"]),
        "datasetManifestSha256": sha(root / "dataset/manifest.json"), "labelSource": "Jev-completed after-state"})
    (root / "INCOMPLETE").unlink()
    print(f"Prepared {root}", flush=True)


def github(url):
    request = urllib.request.Request(url, headers={"User-Agent": "spacer-corpus", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def collect():
    for language, suffixes in [("TypeScript", TS), ("Rust", {".rs"})]:
        root = CORPORA / f"github-top100-{language.lower()}-2026-10-17-v1"
        root.mkdir(parents=True, exist_ok=True)
        (root / "INCOMPLETE").touch()
        selection = root / "selection.json"
        if not selection.exists():
            response = github(f"https://api.github.com/search/repositories?q=language:{language}+fork:false+archived:false+stars:%3E1000&sort=stars&order=desc&per_page=100")
            if response.get("incomplete_results") or len(response["items"]) != 100:
                raise ValueError("Incomplete top-100 search")
            dump(selection, {"queriedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "definition": "Top 100 by GitHub stars, primary language, non-fork, non-archived", "response": response})
        repos = json.loads(selection.read_text())["response"]["items"]
        for index, repo in enumerate(repos):
            slug = repo["full_name"].replace("/", "--")
            destination = root / "repos" / slug
            metadata = root / "provenance" / f"{slug}.json"
            if metadata.exists():
                continue
            print(f"[{language} {index + 1}/100] {repo['full_name']}", flush=True)
            destination.parent.mkdir(parents=True, exist_ok=True)
            if not (destination / ".git").exists():
                destination.mkdir(exist_ok=True)
                run("git", "clone", "--depth=1", "--filter=blob:none", "--no-checkout", repo["clone_url"], destination)
            commit = run("git", "-C", destination, "rev-parse", "HEAD", capture_output=True, text=True).stdout.strip()
            listing = run("git", "-C", destination, "ls-tree", "-r", "-z", "HEAD", capture_output=True).stdout
            paths, licenses = [], []
            for item in listing.split(b"\0"):
                if not item:
                    continue
                details, path = item.decode("utf8").split("\t", 1)
                if not details.startswith("100"):
                    continue  # No symlinks, submodules or executable hooks.
                p = Path(path)
                if p.name.upper().startswith(("LICENSE", "COPYING", "NOTICE")):
                    licenses.append(path)
                elif p.suffix in suffixes and not set(p.parts) & {"node_modules", "vendor", "target", "dist", "build", ".next"}:
                    paths.append(path)
            # Literal file paths for sparse checkout (escape gitignore metacharacters).
            patterns = "\n".join("/" + re.sub(r"([*?\[\]\\!#])", r"\\\1", p) for p in paths + licenses) + "\n"
            run("git", "-C", destination, "sparse-checkout", "set", "--no-cone", "--stdin", input=patterns, text=True)
            run("git", "-C", destination, "checkout", "--force", "HEAD", stdout=subprocess.DEVNULL)
            records = []
            for path in paths:
                file = destination / path
                records.append({"path": str(file.relative_to(root)), "file": f"{repo['full_name']}/{path}", "sha256": sha(file), "bytes": file.stat().st_size, "language": language.lower(), "commit": commit})
            for path in licenses:
                target = root / "licenses" / slug / path
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(destination / path, target)
            shutil.rmtree(destination / ".git")
            dump(metadata, {"repository": repo["full_name"], "commit": commit, "starsAtSelection": repo["stargazers_count"], "license": repo.get("license"), "files": records})
        with (root / "files.jsonl").open("w") as output:
            count = 0
            for path in sorted((root / "provenance").glob("*.json")):
                for row in json.loads(path.read_text())["files"]:
                    output.write(json.dumps(row) + "\n")
                    count += 1
        dump(root / "manifest.json", {"id": root.name, "repositories": 100, "files": count, "labelSource": "original upstream whitespace; no formatter or Jev", "language": language.lower()})
        readme(root, f"Top 100 {language} repositories by stars at the timestamp in selection.json. "
            "Non-fork, non-archived repositories whose primary GitHub language matches. "
            "Source bytes and original blank lines are unchanged; no Jev or formatter runs.\n\n"
            "Only language files are retained; dependency/build directories and symlinks are excluded. "
            "Licenses are separated from training inputs. Selection results, stars, exact commits, and SHA-256 file hashes are preserved.\n\n"
            "## Reproduce\n\n`mise run corpus:collect` resumes from the persisted selection. "
            "For exact historical reproduction, clone each repository at provenance/*.json commit, "
            "retain .ts/.tsx/.mts/.cts for TypeScript or .rs for Rust, excluding node_modules/vendor/target/dist/build/.next. "
            "Do not format sources. Verify every files.jsonl hash. A new search date is a new corpus version.\n")
        (root / "INCOMPLETE").unlink()
        print(f"Completed {root.name}: {count} files", flush=True)


def clean(identifier, target_id):
    source = CORPORA / identifier
    target = CORPORA / target_id
    if (source / "INCOMPLETE").exists():
        raise ValueError("Cannot clean an incomplete corpus")
    target.mkdir(parents=True)  # New immutable version; never overwrite a snapshot.
    (target / "INCOMPLETE").touch()
    for name in ["selection.json", "licenses"]:
        path = source / name
        if path.is_dir():
            shutil.copytree(path, target / name)
        else:
            shutil.copy2(path, target / name)
    kept, removed = 0, []
    by_repo = {}
    with (source / "files.jsonl").open() as input_files, (target / "files.jsonl").open("w") as output:
        for line in input_files:
            row = json.loads(line)
            data = (source / row["path"]).read_bytes()
            if hashlib.sha256(data).hexdigest() != row["sha256"]:
                raise ValueError(f"Changed source bytes: {row['path']}")
            reason = None
            if len(data) >= 188 * 4 and all(data[i * 188] == 0x47 for i in range(4)):
                reason = "MPEG transport stream, not TypeScript source"
            else:
                try:
                    text = data.decode("utf8")
                    if "\0" in text:
                        reason = "Contains NUL bytes; excluded from UTF-8 source corpus"
                except UnicodeDecodeError:
                    reason = "Not UTF-8; excluded from UTF-8 source corpus"
            if reason:
                removed.append({**row, "reason": reason})
                continue
            path = target / row["path"]
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / row["path"], path)
            output.write(json.dumps(row) + "\n")
            slug = Path(row["path"]).parts[1]
            by_repo.setdefault(slug, []).append(row)
            kept += 1
            if kept % 50000 == 0:
                print(f"{target_id}: {kept:,} text sources retained", flush=True)
    for path in (source / "provenance").glob("*.json"):
        metadata = json.loads(path.read_text())
        metadata["files"] = by_repo.get(path.stem, [])
        dump(target / "provenance" / path.name, metadata)
    dump(target / "excluded-binary.json", removed)
    original = json.loads((source / "manifest.json").read_text())
    dump(target / "manifest.json", {**original, "id": target_id, "files": kept,
         "parentCorpus": identifier, "parentManifestSha256": sha(source / "manifest.json"),
         "removedBinaryFiles": len(removed), "cleanup": "MPEG-TS, non-UTF-8 and NUL-containing files excluded; retained source bytes unchanged"})
    readme(target, f"Corrected UTF-8 source snapshot derived from `{identifier}`. "
        f"Retains {kept:,} files; excludes {len(removed):,} binary/non-UTF-8/NUL-containing files. "
        "`.ts` is also the MPEG transport-stream extension, so suffix alone does not establish TypeScript source. "
        "Exclusions, reasons and original hashes are in excluded-binary.json. Retained files are byte-identical; "
        "no formatter or Jev calls are used. Repositories, commits and ranking snapshot are unchanged.\n\n"
        "## Reproduce\n\nFetch the parent corpus, then run:\n\n```sh\n"
        f"mise run corpus:clean -- {identifier} --out-id {target_id}\n```\n")
    (target / "INCOMPLETE").unlink()
    print(f"Completed {target_id}: {kept:,} retained, {len(removed):,} excluded", flush=True)


def archive(identifier):
    root = CORPORA / identifier
    if (root / "INCOMPLETE").exists() or not (root / "manifest.json").exists():
        raise ValueError("Corpus is incomplete")
    for line in (root / "files.jsonl").open():
        row = json.loads(line)
        if sha(root / row["path"]) != row.get("sha256", row.get("afterHash")):
            raise ValueError(f"Source changed before archiving: {row['path']}")
    directory = CORPORA / ".archives" / identifier
    directory.mkdir(parents=True, exist_ok=True)
    archive_file = directory / "corpus.tar.zst"
    if not archive_file.exists():
        run("zipper", "c", "-j", "4", "-m", "zstd", archive_file, identifier, cwd=CORPORA)
    # Independent format validation before any archive manifest is published.
    run("tar", "--zstd", "-tf", archive_file, stdout=subprocess.DEVNULL)
    parts = []
    with archive_file.open("rb") as source:
        while chunk := source.read(200 * 1024 * 1024):
            part = directory / f"corpus.tar.zst.part{len(parts):04}"
            part.write_bytes(chunk)
            parts.append({"name": part.name, "bytes": len(chunk), "sha256": sha(part)})
    manifest = {"id": identifier, "archiveSha256": sha(archive_file), "archiveBytes": archive_file.stat().st_size,
                "format": "TAR Zstandard", "tool": "unxed/zipper 0.1.178", "parts": parts}
    for part in parts:
        path = directory / part["name"]
        key = f"corpora/{identifier}/{path.name}"
        upload(key, path)
        verify = directory / "verify.part"
        download(key, verify)
        if sha(verify) != part["sha256"]:
            raise ValueError(f"Upload verification failed: {key}")
        verify.unlink()
    dump(directory / "archive.json", manifest)
    upload(f"corpora/{identifier}/README.md", root / "README.md")
    upload(f"corpora/{identifier}/archive.json", directory / "archive.json")
    print(f"Uploaded and verified {identifier}: {manifest['archiveBytes']:,} compressed bytes", flush=True)


def fetch(identifier):
    if (CORPORA / identifier).exists():
        raise ValueError("Destination already exists; fetch will not overwrite it")
    CORPORA.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=CORPORA) as temporary:
        directory = Path(temporary)
        download(f"corpora/{identifier}/archive.json", directory / "archive.json")
        manifest = json.loads((directory / "archive.json").read_text())
        archive = directory / "corpus.tar.zst"
        with archive.open("wb") as output:
            for part in manifest["parts"]:
                if not re.fullmatch(r"corpus\.tar\.zst\.part\d{4}", part["name"]):
                    raise ValueError("Invalid archive part")
                path = directory / part["name"]
                download(f"corpora/{identifier}/{path.name}", path)
                if sha(path) != part["sha256"]:
                    raise ValueError("Archive part hash mismatch")
                with path.open("rb") as source:
                    shutil.copyfileobj(source, output)
                path.unlink()
        if sha(archive) != manifest["archiveSha256"]:
            raise ValueError("Combined archive hash mismatch")
        # Teacher train.jsonl exceeds zipper's default 1 GiB per-file limit.
        run("zipper", "x", "-max-file-size", 16 * 1024**3, archive, cwd=directory)
        for line in (directory / identifier / "files.jsonl").open():
            row = json.loads(line)
            if sha(directory / identifier / row["path"]) != row.get("sha256", row.get("afterHash")):
                raise ValueError("Extracted source hash mismatch")
        shutil.move(directory / identifier, CORPORA / identifier)


def migrate():
    directory = ROOT / "tmp/bucket-migration"
    directory.mkdir(exist_ok=True)
    if (directory / "completed.json").exists():
        records = json.loads((directory / "completed.json").read_text())
        keys = {item["key"] for item in json.loads(cf("list", "--per-page", 1000, capture_output=True, text=True).stdout)}
        if all(record["new"] in keys and record["old"] not in keys for record in records):
            print("Model migration already completed and bucket layout verified", flush=True)
            return
    # Enumerate known release manifests, plus the historical pre-catalog artifact.
    catalog = json.loads((ROOT / "tmp/model-releases/catalog.json").read_text())
    prefixes = [entry["id"].removeprefix("spacer-") for entry in catalog]
    prefixes.append("model-rocm-ordered")
    records = []
    for prefix in prefixes:
        files = ["config.json", "best/model.json", "best/weights.bin", "export-check.json"]
        files += ["best.pt", "history.json", "test-report.json"] if prefix == "model-rocm-ordered" else ["release.json"]
        for file in files:
            old, new = f"{prefix}/{file}", f"models/{prefix}/{file}"
            path = directory / old
            if not path.exists():
                download(old, path)
            target = path
            if file == "release.json":
                release = json.loads(path.read_text())
                release["prefix"] = f"models/{prefix}"
                target = directory / new
                dump(target, release)
            upload(new, target)
            verify = directory / "verify.bin"
            download(new, verify)
            if sha(target) != sha(verify):
                raise ValueError(f"Migration mismatch: {new}")
            records.append({"old": old, "new": new, "oldSha256": sha(path), "newSha256": sha(target)})
            dump(directory / "verified.json", records)
            print(f"Verified {new}", flush=True)
    # Only remove old objects once every new object has passed read-back verification.
    for record in records:
        cf("delete", record["old"], "--force", stdout=subprocess.DEVNULL)
    listing = json.loads(cf("list", "--per-page", 1000, capture_output=True, text=True).stdout)
    keys = {item["key"] for item in listing}
    if any(record["old"] in keys or record["new"] not in keys for record in records):
        raise ValueError("Post-migration bucket listing does not match verified migration")
    dump(directory / "completed.json", records)


if __name__ == "__main__":
    os.chdir(ROOT)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["teacher", "collect", "clean", "archive", "fetch", "migrate-models"])
    parser.add_argument("id", nargs="?", type=safe_id)
    parser.add_argument("--out-id", type=safe_id)
    args = parser.parse_args()
    if args.command in {"archive", "fetch"} and not args.id:
        parser.error("archive/fetch requires a corpus ID")
    if args.command == "clean" and (not args.id or not args.out_id):
        parser.error("clean requires a source corpus ID and --out-id")
    {"teacher": teacher, "collect": collect, "archive": lambda: archive(args.id),
     "fetch": lambda: fetch(args.id), "clean": lambda: clean(args.id, args.out_id), "migrate-models": migrate}[args.command]()
