# Completed-work spacing report

**Partial repository coverage:** no repository completed the entire spacing pass. This report covers the 12,577 completed VS Code files. All 25 oxfmt baseline commits exist; the other 24 repositories have not started the full spacing pass. No new API requests were made to generate this report.

Baseline: `58181b264db032cac1548447c04a344124b17d66`. Compare Spacer against this oxfmt commit, not against upstream raw formatting. Context: 5 retained lines on each side; threshold: 55%; request concurrency: 16.

## Totals

| Metric | VS Code completed subset |
| --- | ---: |
| Files formatted | 12,577 |
| Files with spacing changes | 11,240 |
| Unchanged completed files | 1,337 |
| Baseline lines in completed files | 4,578,940 |
| Added lines | 99,118 |
| Deleted lines | 118,607 |
| Absolute changed lines | 217,725 |
| Changed / completed baseline lines | 4.75% |
| Changed / all VS Code baseline TS lines (partial-run figure) | 3.91% |
| Remaining unprocessed VS Code files | 1,465 |
| Excluded VS Code files | 116 |

Changed lines means **added + deleted**, so relocating a blank line counts as two changed lines. Percentages divide by the oxfmt baseline line count, including blank lines. Repository totals use sums, not the mean of file percentages. Exclusions: 21 initial parse failures, 92 non-idempotent oxfmt inputs, 3 questions exceeding the individual API context limit. Excluded files are not included in the completed-subset denominator.

[Complete per-file results for all 12,577 completed files](files.csv) · [All repository coverage and baseline commits](coverage.json)

## Example-file metrics

These 30 files were deliberately chosen from different subsystems to expose contrasting behaviors; examples are not a random accuracy sample. Each excerpt has 45 diff-body lines plus its hunk header. A bare `+` or `-` is an added or removed blank line. Metrics below cover the entire file, not just its excerpt.

| # | File | Baseline lines | + | − | Absolute | % |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | extensions/git/src/main.ts | 397 | 6 | 28 | 34 | 8.56% |
| 2 | extensions/git/src/askpass.ts | 198 | 1 | 13 | 14 | 7.07% |
| 3 | extensions/git/src/staging.ts | 284 | 0 | 23 | 23 | 8.10% |
| 4 | extensions/typescript-language-features/src/filesystems/autoInstallerFs.ts | 280 | 7 | 11 | 18 | 6.43% |
| 5 | extensions/typescript-language-features/src/utils/async.ts | 187 | 0 | 12 | 12 | 6.42% |
| 6 | extensions/typescript-language-features/src/languageFeatures/signatureHelp.ts | 150 | 3 | 8 | 11 | 7.33% |
| 7 | src/vs/base/common/comparers.ts | 385 | 0 | 34 | 34 | 8.83% |
| 8 | src/vs/base/common/objects.ts | 300 | 23 | 7 | 30 | 10.00% |
| 9 | src/vs/base/common/image.ts | 183 | 17 | 0 | 17 | 9.29% |
| 10 | src/vs/base/common/sseParser.ts | 243 | 6 | 13 | 19 | 7.82% |
| 11 | src/vs/base/common/jsonFormatter.ts | 283 | 12 | 4 | 16 | 5.65% |
| 12 | src/vs/base/common/uriTemplate.ts | 318 | 13 | 2 | 15 | 4.72% |
| 13 | src/vs/editor/common/viewEventHandler.ts | 217 | 17 | 22 | 39 | 17.97% |
| 14 | src/vs/editor/common/services/languageFeatures.ts | 114 | 0 | 33 | 33 | 28.95% |
| 15 | src/vs/editor/common/core/textChange.ts | 341 | 4 | 22 | 26 | 7.62% |
| 16 | src/vs/editor/common/editorContextKeys.ts | 372 | 21 | 5 | 26 | 6.99% |
| 17 | src/vs/editor/common/languages/linkComputer.ts | 369 | 4 | 21 | 25 | 6.78% |
| 18 | src/vs/platform/agentHost/browser/nullAgentHostService.ts | 303 | 48 | 2 | 50 | 16.50% |
| 19 | src/vs/platform/agentHost/common/webPubSub/chunking.ts | 396 | 15 | 15 | 30 | 7.58% |
| 20 | src/vs/platform/files/common/diskFileSystemProviderClient.ts | 325 | 1 | 29 | 30 | 9.23% |
| 21 | src/vs/platform/agentHost/common/meta/vscode/agentUsageMeta.ts | 317 | 26 | 0 | 26 | 8.20% |
| 22 | src/vs/platform/theme/common/sizes/baseSizes.ts | 258 | 0 | 24 | 24 | 9.30% |
| 23 | src/vs/workbench/contrib/debug/common/nullDebugService.ts | 313 | 47 | 2 | 49 | 15.65% |
| 24 | src/vs/workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.ts | 273 | 17 | 8 | 25 | 9.16% |
| 25 | src/vs/workbench/contrib/terminal/browser/terminalConfigurationService.ts | 353 | 10 | 18 | 28 | 7.93% |
| 26 | extensions/copilot/src/platform/telemetry/common/telemetry.ts | 375 | 21 | 6 | 27 | 7.20% |
| 27 | extensions/copilot/src/platform/notebook/common/alternativeContentProvider.xml.ts | 322 | 14 | 11 | 25 | 7.76% |
| 28 | extensions/copilot/src/platform/configuration/common/validator.ts | 368 | 8 | 13 | 21 | 5.71% |
| 29 | extensions/copilot/src/platform/workspaceChunkSearch/node/codeSearch/workspaceDiff.ts | 290 | 3 | 17 | 20 | 6.90% |
| 30 | extensions/copilot/src/platform/promptFiles/vscode-node/agentInstructionsLocator.ts | 355 | 15 | 3 | 18 | 5.07% |

## Interpretation

The original blank-line decisions are removed before inference. Jev reconstructs a generic style from local context, so it cannot preserve a repository convention merely because it was present. Model probabilities below are recorded Noul outputs, not explanations. A missing probability means the parser did not submit that boundary; removal there is structural rather than an AI judgment. The explanations are hypotheses informed by the code and these recorded decisions.

### Main findings

1. **Candidate generation causes irreversible losses.** Grouped array entries and region-comment spacing disappear without a model decision (examples 4, 10, 17, 20, 25). This is not something a better prompt alone can fix.
2. **The policy is syntax-heavy, not repository-style-aware.** Fields and constant tables are compressed while methods and signatures are expanded, including repetitive stubs (14, 18, 19, 22, 23, 26).
3. **Independent windows do not enforce consistency.** Mirrored loops get different spacing (8), some identical empty methods remain adjacent while others are separated (23), and a variable/check pair may be split in one context but joined in another (2, 21, 30).
4. **A hard threshold amplifies small differences.** Several meaningful boundaries are removed at 53–54%, while additions at exactly 55% are accepted (3, 5, 12, 19, 27, 28, 30). These probabilities are not proof of formatting quality.
5. **Some deviations are reasonable improvements.** JPEG parsing, chunk construction and asynchronous playback gain useful phase separation (9, 19, 24). Agreement with the baseline should not be treated as an accuracy score.

### Priorities for a later iteration

First distinguish structural no-space boundaries from unmodeled-but-valid boundaries, including array groups and region headings. Then make a shared style decision for repetitive runs (fields, methods, registration tables), rather than judging every boundary in isolation. Finally evaluate a wider-context or second-pass consistency check for borderline decisions. These are recommendations from this report; no formatter policy was changed while generating it.

## 1. extensions/git/src/main.ts

Whole file: **+6 / −28 = 34 changed lines (8.56%)** of 397 baseline lines.

```diff
@@ -310,44 +298,38 @@
-
     commands.executeCommand("setContext", "git.missing", true);
     warnAboutMissingGit();
-
     return new GitExtensionImpl();
   } finally {
     disposables.push(new GitProtocolHandler(logger));
   }
 }
 
 let _context: ExtensionContext;
+
 export function getExtensionContext(): ExtensionContext {
   return _context;
 }
 
 export async function activate(context: ExtensionContext): Promise<GitExtension> {
   _context = context;
-
   const result = await _activate(context);
   context.subscriptions.push(registerAPICommands(result));
   return result;
 }
 
 async function checkGitv1(info: IGit): Promise<void> {
   const config = workspace.getConfiguration("git");
   const shouldIgnore = config.get<boolean>("ignoreLegacyWarning") === true;
-
   if (shouldIgnore) {
     return;
   }
-
   if (!/^[01]/.test(info.version)) {
     return;
   }
 
   const update = l10n.t("Update Git");
   const neverShowAgain = l10n.t("Don't Show Again");
-
   const choice = await window.showWarningMessage(
     l10n.t('You seem to have git "{0}" installed. Code works best with git >= 2', info.version),
     update,
     neverShowAgain,
   );
-
```

**Analysis:** The model strongly separates a module variable from an exported function (82%), but treats activation, configuration reads and checks as tightly coupled work. That conflicts with the original's use of blank lines around side effects and early exits. The second Git-version guard scores 53%, just below the 55% threshold, so a plausible phase boundary is lost. This is a mix of generic declaration spacing and threshold-sensitive procedural spacing, not a consistent reconstruction of the author's paragraph structure.

**Recorded decisions (following code line within excerpt):** before baseline L311: 19% yes, removed; before baseline L314: 46% yes, removed; before baseline L328: 28% yes, removed; before baseline L337: 25% yes, removed; before baseline L341: 53% yes, removed; before baseline L348: 23% yes, removed; before baseline L321: 82% yes, added.

## 2. extensions/git/src/askpass.ts

Whole file: **+1 / −13 = 14 changed lines (7.07%)** of 198 baseline lines.

```diff
@@ -60,45 +58,39 @@
   async handle(payload: { askpassType: "https" | "ssh"; argv: string[] }): Promise<string> {
     this.logger.trace(`[Askpass][handle] ${JSON.stringify(payload)}`);
-
     const config = workspace.getConfiguration("git", null);
     const enabled = config.get<boolean>("enabled");
-
     if (!enabled) {
       this.logger.trace(`[Askpass][handle] Git is disabled`);
       return "";
     }
 
     return payload.askpassType === "https"
       ? await this.handleAskpass(payload.argv)
       : await this.handleSSHAskpass(payload.argv);
   }
 
   async handleAskpass(argv: string[]): Promise<string> {
     // HTTPS (username | password)
     // Username for 'https://github.com':
     // Password for 'https://github.com':
     const request = argv[2];
     const host = argv[4].replace(/^["']+|["':]+$/g, "");
-
     this.logger.trace(`[Askpass][handleAskpass] request: ${request}, host: ${host}`);
-
     const uri = Uri.parse(host);
     const authority = uri.authority.replace(/^.*@/, "");
     const password = /password/i.test(request);
     const cached = this.cache.get(authority);
-
     if (cached && password) {
       this.cache.delete(authority);
       clearTimeout(this.cacheEvictionTimers.get(authority));
       this.cacheEvictionTimers.delete(authority);
       return cached.password;
     }
 
     if (!password) {
       for (const credentialsProvider of this.credentialsProviders) {
         try {
           const credentials = await credentialsProvider.getCredentials(uri);
-
           if (credentials) {
             this.cache.set(authority, credentials);
             clearTimeout(this.cacheEvictionTimers.get(authority));
```

**Analysis:** The original isolates logging, configuration lookup, credential parsing and cache handling. Jev instead follows data dependencies: read a value, check it, then use it. All removed boundaries score only 17–38%, so a small threshold adjustment would not restore them. Logging is treated as another statement in the same operation rather than an instrumentation boundary. The result is denser and loses some navigational structure, although the short lookup/check pairs remain coherent.

**Recorded decisions (following code line within excerpt):** before baseline L63: 34% yes, removed; before baseline L66: 30% yes, removed; before baseline L83: 17% yes, removed; before baseline L85: 36% yes, removed; before baseline L90: 38% yes, removed; before baseline L102: 17% yes, removed.

## 3. extensions/git/src/staging.ts

Whole file: **+0 / −23 = 23 changed lines (8.10%)** of 284 baseline lines.

```diff
@@ -18,45 +18,37 @@
   modified: TextDocument,
   diffs: LineChange[],
 ): string {
   const result: string[] = [];
   let currentLine = 0;
-
   for (const diff of diffs) {
     const isInsertion = diff.originalEndLineNumber === 0;
     const isDeletion = diff.modifiedEndLineNumber === 0;
-
     let endLine = isInsertion ? diff.originalStartLineNumber : diff.originalStartLineNumber - 1;
     let endCharacter = 0;
-
     // if this is a deletion at the very end of the document,then we need to account
     // for a newline at the end of the last line which may have been deleted
     // https://github.com/microsoft/vscode/issues/59670
     if (isDeletion && diff.originalEndLineNumber === original.lineCount) {
       endLine -= 1;
       endCharacter = original.lineAt(endLine).range.end.character;
     }
 
     result.push(original.getText(new Range(currentLine, 0, endLine, endCharacter)));
-
     if (!isDeletion) {
       let fromLine = diff.modifiedStartLineNumber - 1;
       let fromCharacter = 0;
-
       // if this is an insertion at the very end of the document,
       // then we must start the next range after the last character of the
       // previous line, in order to take the correct eol
       if (isInsertion && diff.originalStartLineNumber === original.lineCount) {
         fromLine -= 1;
         fromCharacter = modified.lineAt(fromLine).range.end.character;
       }
-
       result.push(
         modified.getText(new Range(fromLine, fromCharacter, diff.modifiedEndLineNumber, 0)),
       );
     }
-
     currentLine = isInsertion ? diff.originalStartLineNumber : diff.originalEndLineNumber;
   }
 
   result.push(original.getText(new Range(currentLine, 0, original.lineCount, 0)));
-
```

**Analysis:** The original lays out the diff algorithm as setup, deletion adjustment, copying, insertion adjustment and cursor advancement. Jev groups nearby variables and their consumers instead, removing even the gap before a multi-line explanatory comment. The boundary before the insertion branch scores 54%, and cursor advancement 53%: both narrowly miss the cutoff. Five local lines do not expose the whole algorithm well enough to consistently distinguish its stages.

**Recorded decisions (following code line within excerpt):** before baseline L24: 29% yes, removed; before baseline L28: 16% yes, removed; before baseline L31: 30% yes, removed; before baseline L41: 54% yes, removed; before baseline L45: 35% yes, removed; before baseline L53: 36% yes, removed; before baseline L58: 53% yes, removed.

## 4. extensions/typescript-language-features/src/filesystems/autoInstallerFs.ts

Whole file: **+7 / −11 = 18 changed lines (6.43%)** of 280 baseline lines.

```diff
@@ -85,45 +83,38 @@
   watch(resource: vscode.Uri): vscode.Disposable {
     this.logger.trace(`AutoInstallerFs.watch. Resource: ${resource.toString()}}`);
     return this.memfs.watch(resource);
   }
 
   async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
     this.logger.trace(`AutoInstallerFs.stat: ${uri}`);
-
     const mapped = new MappedUri(uri);
 
     // TODO: case sensitivity configuration
-
     // We pretend every single node_modules or @types directory ever actually
     // exists.
     if (basename(mapped.path) === "node_modules" || basename(mapped.path) === "@types") {
       return {
         mtime: 0,
         ctime: 0,
         type: vscode.FileType.Directory,
         size: 0,
       };
     }
 
     await this.ensurePackageContents(mapped);
-
     return this.memfs.stat(URI.file(mapped.path));
   }
 
   async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
     this.logger.trace(`AutoInstallerFs.readDirectory: ${uri}`);
-
     const mapped = new MappedUri(uri);
     await this.ensurePackageContents(mapped);
-
     return this.memfs.readDirectory(URI.file(mapped.path));
   }
 
   async readFile(uri: vscode.Uri): Promise<Uint8Array> {
     this.logger.trace(`AutoInstallerFs.readFile: ${uri}`);
-
     const mapped = new MappedUri(uri);
     await this.ensurePackageContents(mapped);
-
     return this.memfs.readFile(URI.file(mapped.path));
   }
```

**Analysis:** There are two different causes. Gaps around tracing and final filesystem calls receive 28–43% yes: the model sees compact wrapper methods and keeps their steps together. The blank between the TODO and the following explanatory comment has no recorded probability at all. The parser groups the leading comments into one attached block, so that boundary cannot survive regardless of the prompt or threshold. The original intentionally separated two different kinds of comment.

**Recorded decisions (following code line within excerpt):** before baseline L93: 40% yes, removed; before baseline L97: not submitted (structural exclusion), removed; before baseline L110: 43% yes, removed; before baseline L116: 28% yes, removed; before baseline L119: 34% yes, removed; before baseline L125: 30% yes, removed; before baseline L128: 36% yes, removed.

## 5. extensions/typescript-language-features/src/utils/async.ts

Whole file: **+0 / −12 = 12 changed lines (6.42%)** of 187 baseline lines.

```diff
@@ -107,45 +105,37 @@
   private queuedPromise: Promise<any> | null;
   private queuedPromiseFactory: ITask<Promise<any>> | null;
-
   private isDisposed = false;
 
   constructor() {
     this.activePromise = null;
     this.queuedPromise = null;
     this.queuedPromiseFactory = null;
   }
 
   queue<T>(promiseFactory: ITask<Promise<T>>): Promise<T> {
     if (this.isDisposed) {
       return Promise.reject(new Error("Throttler is disposed"));
     }
-
     if (this.activePromise) {
       this.queuedPromiseFactory = promiseFactory;
-
       if (!this.queuedPromise) {
         const onComplete = () => {
           this.queuedPromise = null;
-
           if (this.isDisposed) {
             return;
           }
-
           const result = this.queue(this.queuedPromiseFactory!);
           this.queuedPromiseFactory = null;
-
           return result;
         };
 
         this.queuedPromise = new Promise((resolve) => {
           this.activePromise!.then(onComplete, onComplete).then(resolve);
         });
       }
-
       return new Promise((resolve, reject) => {
         this.queuedPromise!.then(resolve, reject);
       });
     }
 
     this.activePromise = promiseFactory();
-
```

**Analysis:** The formatter collapses disposal state into the other fields, then merges several lifecycle phases inside the throttler. Closely related assignments and immediate returns get low scores, which follows the compact-code rule. But the transition after the disposed guard is 53%, and returning the queued promise is 49%; these are reasonable phase boundaries that the cutoff removes. The model does not maintain a global paragraph plan across nested asynchronous callbacks.

**Recorded decisions (following code line within excerpt):** before baseline L110: 16% yes, removed; before baseline L123: 53% yes, removed; before baseline L126: 16% yes, removed; before baseline L130: 11% yes, removed; before baseline L134: 39% yes, removed; before baseline L137: 18% yes, removed; before baseline L145: 49% yes, removed.

## 6. extensions/typescript-language-features/src/languageFeatures/signatureHelp.ts

Whole file: **+3 / −8 = 11 changed lines (7.33%)** of 150 baseline lines.

```diff
@@ -86,45 +86,39 @@
       const label = Previewer.asPlainTextWithLinks(parameter.displayParts, this.client);
-
       signature.parameters.push(
         new vscode.ParameterInformation(
           [textIndex, textIndex + label.length],
           Previewer.documentationToMarkdown(parameter.documentation, [], this.client, baseUri),
         ),
       );
-
       textIndex += label.length;
       signature.label += label;
-
       if (i !== item.parameters.length - 1) {
         signature.label += separatorLabel;
         textIndex += separatorLabel.length;
       }
     }
-
     signature.label += Previewer.asPlainTextWithLinks(item.suffixDisplayParts, this.client);
     return signature;
   }
 }
 
 function toTsTriggerReason(context: vscode.SignatureHelpContext): Proto.SignatureHelpTriggerReason {
   switch (context.triggerKind) {
     case vscode.SignatureHelpTriggerKind.TriggerCharacter:
       if (context.triggerCharacter) {
         if (context.isRetrigger) {
           return {
             kind: "retrigger",
             triggerCharacter: context.triggerCharacter as Proto.SignatureHelpRetriggerCharacter,
           };
         } else {
           return {
             kind: "characterTyped",
             triggerCharacter: context.triggerCharacter as Proto.SignatureHelpTriggerCharacter,
           };
         }
       } else {
         return { kind: "invoked" };
       }
-
     case vscode.SignatureHelpTriggerKind.ContentChange:
       return context.isRetrigger ? { kind: "retrigger" } : { kind: "invoked" };
-
```

**Analysis:** The signature-building loop loses separation between producing a parameter, updating offsets, adding separators and appending the suffix. Jev appears to see one repeated assembly operation, with every step dependent on the previous one. The switch-case boundary is also explicitly scored low (25%), rather than structurally excluded. Thus the original's visual separation of alternatives is being overruled by the model's tendency to keep one switch compact.

**Recorded decisions (following code line within excerpt):** before baseline L88: 16% yes, removed; before baseline L95: 38% yes, removed; before baseline L98: 14% yes, removed; before baseline L104: 47% yes, removed; before baseline L128: 25% yes, removed.

## 7. src/vs/base/common/comparers.ts

Whole file: **+0 / −34 = 34 changed lines (8.83%)** of 385 baseline lines.

```diff
@@ -287,45 +265,38 @@
 function compareCaseUpperFirst(one: string, other: string): number {
   if (startsWithUpper(one) && startsWithLower(other)) {
     return -1;
   }
   return startsWithLower(one) && startsWithUpper(other) ? 1 : 0;
 }
 
 function comparePathComponents(one: string, other: string, caseSensitive = false): number {
   if (!caseSensitive) {
     one = one && one.toLowerCase();
     other = other && other.toLowerCase();
   }
-
   if (one === other) {
     return 0;
   }
-
   return one < other ? -1 : 1;
 }
 
 export function comparePaths(one: string, other: string, caseSensitive = false): number {
   const oneParts = one.split(sep);
   const otherParts = other.split(sep);
-
   const lastOne = oneParts.length - 1;
   const lastOther = otherParts.length - 1;
   let endOne: boolean, endOther: boolean;
-
   for (let i = 0; ; i++) {
     endOne = lastOne === i;
     endOther = lastOther === i;
-
     if (endOne && endOther) {
       return compareFileNames(oneParts[i], otherParts[i], caseSensitive);
     } else if (endOne) {
       return -1;
     } else if (endOther) {
       return 1;
     }
-
     const result = comparePathComponents(oneParts[i], otherParts[i], caseSensitive);
-
     if (result !== 0) {
       return result;
     }
```

**Analysis:** The author's spacing distinguishes normalization, equality checks, fallback ordering, path setup and component comparison. Jev sees a single comparison routine with tightly connected values, so all these boundaries fall below 55%. Some removals between paired declarations are defensible, but normalization-to-comparison and loop-to-comparison transitions also disappear. The general instruction to keep related operations together is winning over the instruction to separate meaningful phases.

**Recorded decisions (following code line within excerpt):** before baseline L300: 42% yes, removed; before baseline L304: 36% yes, removed; before baseline L311: 21% yes, removed; before baseline L315: 39% yes, removed; before baseline L319: 17% yes, removed; before baseline L327: 44% yes, removed; before baseline L329: 22% yes, removed.

## 8. src/vs/base/common/objects.ts

Whole file: **+23 / −7 = 30 changed lines (10.00%)** of 300 baseline lines.

```diff
@@ -124,38 +129,43 @@
   }
   if (Array.isArray(one) !== Array.isArray(other)) {
     return false;
   }
 
   let i: number;
   let key: string;
-
   if (Array.isArray(one)) {
     if (one.length !== other.length) {
       return false;
     }
+
     for (i = 0; i < one.length; i++) {
       if (!equals(one[i], other[i])) {
         return false;
       }
     }
   } else {
     const oneKeys: string[] = [];
-
     for (key in one) {
       oneKeys.push(key);
     }
     oneKeys.sort();
+
     const otherKeys: string[] = [];
+
     for (key in other) {
       otherKeys.push(key);
     }
+
     otherKeys.sort();
+
     if (!equals(oneKeys, otherKeys)) {
       return false;
     }
+
     for (i = 0; i < oneKeys.length; i++) {
       if (!equals(one[oneKeys[i]], other[oneKeys[i]])) {
         return false;
       }
     }
   }
+
```

**Analysis:** This is a strong local-consistency failure. The original gap before iterating oneKeys is removed at 22%, while an analogous gap before iterating otherKeys is inserted at 56%. Jev additionally separates sorting, checking key equality and comparing values. Those larger phases are reasonable, but the mirror-image loops now have different spacing. Independent five-line windows and a hard cutoff do not enforce symmetry across repeated patterns within the same function.

**Recorded decisions (following code line within excerpt):** before baseline L132: 38% yes, removed; before baseline L144: 22% yes, removed; before baseline L136: 58% yes, added; before baseline L148: 63% yes, added; before baseline L149: 56% yes, added; before baseline L152: 59% yes, added; before baseline L153: 71% yes, added; before baseline L156: 69% yes, added.

## 9. src/vs/base/common/image.ts

Whole file: **+17 / −0 = 17 changed lines (9.29%)** of 183 baseline lines.

```diff
@@ -72,39 +76,45 @@
   let i = 2;
   while (i < bytes.length - 9) {
     // Skip fill bytes (0xFF) before the marker.
     while (i < bytes.length && bytes[i] === 0xff) {
       i++;
     }
+
     if (i >= bytes.length) {
       return undefined;
     }
+
     const marker = bytes[i];
     i++;
+
     // Standalone markers without a length field.
     if (
       marker === 0xd8 ||
       marker === 0xd9 ||
       marker === 0x01 ||
       (marker >= 0xd0 && marker <= 0xd7)
     ) {
       continue;
     }
+
     if (i + 1 >= bytes.length) {
       return undefined;
     }
     const segLength = (bytes[i] << 8) | bytes[i + 1];
     // The 2-byte length field includes itself, so anything < 2 is corrupt.
     if (segLength < 2) {
       return undefined;
     }
+
     // SOFn markers (0xC0..0xCF) carry the frame dimensions, except DHT (0xC4), JPG (0xC8) and DAC (0xCC).
     if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
       if (i + 6 >= bytes.length) {
         return undefined;
       }
       const height = (bytes[i + 3] << 8) | bytes[i + 4];
       const width = (bytes[i + 5] << 8) | bytes[i + 6];
       return { width, height };
     }
     i += segLength;
   }
+
```

**Analysis:** Here the new spacing is mostly defensible. The original JPEG scanner is compact; Jev identifies fill-byte skipping, bounds checks, marker classification and frame extraction as separate stages. Insertions score 57–81%, matching the prompt's preference for separation after completed guards and before section comments. The mismatch reflects a different readability preference rather than obviously misplaced breaks, although repeated guards can still make the result more spread out than the surrounding project style.

**Recorded decisions (following code line within excerpt):** before baseline L78: 57% yes, added; before baseline L81: 72% yes, added; before baseline L83: 64% yes, added; before baseline L92: 61% yes, added; before baseline L100: 81% yes, added.

## 10. src/vs/base/common/sseParser.ts

Whole file: **+6 / −13 = 19 changed lines (7.82%)** of 243 baseline lines.

```diff
@@ -153,43 +151,39 @@
-
       // If value starts with a space, remove it
       if (value.startsWith(" ")) {
         value = value.substring(1);
       }
     }
-
     this.processField(field, value);
   }
+
   /**
    * Processes a field with the given name and value.
    */
   private processField(field: string, value: string): void {
     switch (field) {
       case "event":
         this.eventTypeBuffer = value;
         break;
-
       case "data":
         // Append the value to the data buffer, followed by a newline
         this.dataBuffer += value;
         this.dataBuffer += "\n";
         break;
-
       case "id":
         // If the field value doesn't contain NULL, set the last event ID buffer
         if (!value.includes("\0")) {
           this.currentEventId = this.lastEventIdBuffer = value;
         } else {
           this.currentEventId = undefined;
         }
         break;
-
       case "retry":
         // If the field value consists only of ASCII digits, set the reconnection time
         if (/^\d+$/.test(value)) {
           this.reconnectionTime = parseInt(value, 10);
         }
         break;
-
       // Ignore any other fields
     }
   }
+
```

**Analysis:** Method-level and switch-level rules pull in opposite directions. The gap before the next method's documentation is added with 90% yes, while case separations score only 13–20% and disappear. The model groups all field handlers as one switch operation, despite the original treating cases as paragraphs. The gap before the final Ignore comment is structurally excluded because it is not a candidate between two statements or members; changing the model threshold cannot restore that one.

**Recorded decisions (following code line within excerpt):** before baseline L154: 32% yes, removed; before baseline L160: 53% yes, removed; before baseline L171: 13% yes, removed; before baseline L177: 20% yes, removed; before baseline L186: 16% yes, removed; before baseline L193: not submitted (structural exclusion), removed; before baseline L162: 90% yes, added.

## 11. src/vs/base/common/jsonFormatter.ts

Whole file: **+12 / −4 = 16 changed lines (5.65%)** of 283 baseline lines.

```diff
@@ -63,40 +63,43 @@
   let rangeStart: number;
   let rangeEnd: number;
   if (range) {
     rangeStart = range.offset;
     rangeEnd = rangeStart + range.length;
-
     formatTextStart = rangeStart;
     while (formatTextStart > 0 && !isEOL(documentText, formatTextStart - 1)) {
       formatTextStart--;
     }
+
     let endOffset = rangeEnd;
+
     while (endOffset < documentText.length && !isEOL(documentText, endOffset)) {
       endOffset++;
     }
+
     formatText = documentText.substring(formatTextStart, endOffset);
     initialIndentLevel = computeIndentLevel(formatText, options);
   } else {
     formatText = documentText;
     initialIndentLevel = 0;
     formatTextStart = 0;
     rangeStart = 0;
     rangeEnd = documentText.length;
   }
-  const eol = getEOL(options, documentText);
 
+  const eol = getEOL(options, documentText);
   let lineBreak = false;
   let indentLevel = 0;
   let indentValue: string;
   if (options.insertSpaces) {
     indentValue = repeat(" ", options.tabSize || 4);
   } else {
     indentValue = "\t";
   }
 
   const scanner = createScanner(formatText, false);
   let hasError = false;
 
   function newLineAndIndent(): string {
     return eol + repeat(indentValue, initialIndentLevel + indentLevel);
   }
+
```

**Analysis:** Jev recognizes a phase transition between scanning the start and end of a range, then moves separation to before the eol declaration rather than after it. However, both sides of the endOffset loop receive 56%, barely above the threshold, making a tightly related variable/loop pair more fragmented. The diff displays the eol line as removed and re-added because a blank line moved across it; the nonempty source sequence is unchanged. Local judgments do not maintain a consistent setup-versus-processing convention.

**Recorded decisions (following code line within excerpt):** before baseline L69: 20% yes, removed; before baseline L88: 35% yes, removed; before baseline L73: 77% yes, added; before baseline L74: 56% yes, added; before baseline L77: 56% yes, added; before baseline L86: 73% yes, added.

## 12. src/vs/base/common/uriTemplate.ts

Whole file: **+13 / −2 = 15 changed lines (4.72%)** of 318 baseline lines.

```diff
@@ -40,42 +40,44 @@
   public static parse(template: string): UriTemplate {
     const components: Array<IUriTemplateComponent | string> = [];
     const regex = /\{([^{}]+)\}/g;
     let match: RegExpExecArray | null;
     let lastPos = 0;
     while ((match = regex.exec(template))) {
       const [expression, inner] = match;
       components.push(template.slice(lastPos, match.index));
       lastPos = match.index + expression.length;
-
       // Handle escaped braces: treat '{{' and '}}' as literals, not expressions
       if (template[match.index - 1] === "{" || template[lastPos] === "}") {
         components.push(inner);
         continue;
       }
 
       let operator = "";
       let rest = inner;
       if (rest.length > 0 && UriTemplate._isOperator(rest[0])) {
         operator = rest[0];
         rest = rest.slice(1);
       }
+
       const variables = rest.split(",").map((v): IUriTemplateVariable => {
         let name = v;
         let explodable = false;
         let repeatable = false;
         let prefixLength: number | undefined = undefined;
         let optional = false;
         if (name.endsWith("*")) {
           explodable = true;
           repeatable = true;
           name = name.slice(0, -1);
         }
+
         const prefixMatch = name.match(/^(.*?):(\d+)$/);
         if (prefixMatch) {
           name = prefixMatch[1];
           prefixLength = parseInt(prefixMatch[2], 10);
         }
+
         if (name.endsWith("?")) {
           optional = true;
           name = name.slice(0, -1);
         }
```

**Analysis:** The escape-handling comment loses its preceding blank at 54%, while variable parsing and modifier handling gain breaks at 58–78%. The new breaks plausibly separate parsing stages, but the removed escape-handling boundary serves the same purpose. This illustrates cutoff sensitivity: a one-point difference determines whether a section survives. The formatter cannot use the original section structure as a tie-breaker because that spacing is deliberately stripped before inference.

**Recorded decisions (following code line within excerpt):** before baseline L50: 54% yes, removed; before baseline L62: 78% yes, added; before baseline L73: 78% yes, added; before baseline L78: 58% yes, added.

## 13. src/vs/editor/common/viewEventHandler.ts

Whole file: **+17 / −22 = 39 changed lines (17.97%)** of 217 baseline lines.

```diff
@@ -34,34 +34,44 @@
-
   public onCompositionStart(e: viewEvents.ViewCompositionStartEvent): boolean {
     return false;
   }
+
   public onCompositionEnd(e: viewEvents.ViewCompositionEndEvent): boolean {
     return false;
   }
+
   public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
     return false;
   }
+
   public onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
     return false;
   }
+
   public onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
     return false;
   }
+
   public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
     return false;
   }
+
   public onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boolean {
     return false;
   }
+
   public onLanguageConfigurationChanged(e: viewEvents.ViewLanguageConfigurationEvent): boolean {
     return false;
   }
+
   public onLineMappingChanged(e: viewEvents.ViewLineMappingChangedEvent): boolean {
     return false;
   }
+
   public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
     return false;
   }
+
   public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
     return false;
   }
+
```

**Analysis:** The original groups a long run of trivial event-handler stubs compactly. Jev applies the generic separate-methods rule, assigning 68–78% to most method boundaries and expanding the list. It does not recognize the stronger local convention that these nearly identical overrides form one table-like group. The leading removed gap follows the begin-event-handlers section comment; the parser attaches that comment to the first method, so this particular removal is structural rather than probabilistic.

**Recorded decisions (following code line within excerpt):** before baseline L35: not submitted (structural exclusion), removed; before baseline L38: 78% yes, added; before baseline L41: 70% yes, added; before baseline L44: 75% yes, added; before baseline L47: 75% yes, added; before baseline L50: 73% yes, added; before baseline L53: 70% yes, added; before baseline L56: 72% yes, added; before baseline L59: 73% yes, added; before baseline L62: 68% yes, added; before baseline L65: 76% yes, added.

## 14. src/vs/editor/common/services/languageFeatures.ts

Whole file: **+0 / −33 = 33 changed lines (28.95%)** of 114 baseline lines.

```diff
@@ -48,45 +48,22 @@
-
   readonly referenceProvider: LanguageFeatureRegistry<ReferenceProvider>;
-
   readonly definitionProvider: LanguageFeatureRegistry<DefinitionProvider>;
-
   readonly typeDefinitionProvider: LanguageFeatureRegistry<TypeDefinitionProvider>;
-
   readonly declarationProvider: LanguageFeatureRegistry<DeclarationProvider>;
-
   readonly implementationProvider: LanguageFeatureRegistry<ImplementationProvider>;
-
   readonly codeActionProvider: LanguageFeatureRegistry<CodeActionProvider>;
-
   readonly documentPasteEditProvider: LanguageFeatureRegistry<DocumentPasteEditProvider>;
-
   readonly renameProvider: LanguageFeatureRegistry<RenameProvider>;
-
   readonly newSymbolNamesProvider: LanguageFeatureRegistry<NewSymbolNamesProvider>;
-
   readonly documentFormattingEditProvider: LanguageFeatureRegistry<DocumentFormattingEditProvider>;
-
   readonly documentRangeFormattingEditProvider: LanguageFeatureRegistry<DocumentRangeFormattingEditProvider>;
-
   readonly onTypeFormattingEditProvider: LanguageFeatureRegistry<OnTypeFormattingEditProvider>;
-
   readonly documentSymbolProvider: LanguageFeatureRegistry<DocumentSymbolProvider>;
-
   readonly inlayHintsProvider: LanguageFeatureRegistry<InlayHintsProvider>;
-
   readonly colorProvider: LanguageFeatureRegistry<DocumentColorProvider>;
-
   readonly codeLensProvider: LanguageFeatureRegistry<CodeLensProvider>;
-
   readonly signatureHelpProvider: LanguageFeatureRegistry<SignatureHelpProvider>;
-
   readonly hoverProvider: LanguageFeatureRegistry<HoverProvider>;
-
   readonly documentHighlightProvider: LanguageFeatureRegistry<DocumentHighlightProvider>;
-
   readonly multiDocumentHighlightProvider: LanguageFeatureRegistry<MultiDocumentHighlightProvider>;
-
   readonly documentRangeSemanticTokensProvider: LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider>;
-
   readonly documentSemanticTokensProvider: LanguageFeatureRegistry<DocumentSemanticTokensProvider>;
-
```

**Analysis:** The original deliberately puts a blank between every interface registry property. Jev gives those boundaries just 7–12%, following the rule that ordinary adjacent fields should stay compact. This is systematic and internally consistent, but inconsistent with the source's deliberately airy API listing. Modestly lowering the threshold would not recover this convention. Matching it would require a different member-spacing policy or a repository style signal, not more examples of function-body phase separation.

**Recorded decisions (following code line within excerpt):** before baseline L49: 7% yes, removed; before baseline L51: 7% yes, removed; before baseline L53: 7% yes, removed; before baseline L55: 7% yes, removed; before baseline L57: 9% yes, removed; before baseline L59: 11% yes, removed; before baseline L61: 10% yes, removed; before baseline L63: 9% yes, removed; before baseline L65: 9% yes, removed; before baseline L67: 12% yes, removed; before baseline L69: 7% yes, removed; before baseline L71: 9% yes, removed; before baseline L73: 8% yes, removed; before baseline L75: 10% yes, removed; before baseline L77: 11% yes, removed; before baseline L79: 10% yes, removed; before baseline L81: 11% yes, removed; before baseline L83: 8% yes, removed; before baseline L85: 10% yes, removed; before baseline L87: 9% yes, removed; before baseline L89: 9% yes, removed; before baseline L91: 8% yes, removed.

## 15. src/vs/editor/common/core/textChange.ts

Whole file: **+4 / −22 = 26 changed lines (7.62%)** of 341 baseline lines.

```diff
@@ -114,45 +115,35 @@
   private _currEdits: TextChange[];
-
   private _result: TextChange[];
   private _resultLen: number;
-
   private _prevLen: number;
   private _prevDeltaOffset: number;
-
   private _currLen: number;
   private _currDeltaOffset: number;
 
   constructor(prevEdits: TextChange[], currEdits: TextChange[]) {
     this._prevEdits = prevEdits;
     this._currEdits = currEdits;
-
     this._result = [];
     this._resultLen = 0;
-
     this._prevLen = this._prevEdits.length;
     this._prevDeltaOffset = 0;
-
     this._currLen = this._currEdits.length;
     this._currDeltaOffset = 0;
   }
 
   public compress(): TextChange[] {
     let prevIndex = 0;
     let currIndex = 0;
-
     let prevEdit = this._getPrev(prevIndex);
     let currEdit = this._getCurr(currIndex);
-
     while (prevIndex < this._prevLen || currIndex < this._currLen) {
       if (prevEdit === null) {
         this._acceptCurr(currEdit!);
         currEdit = this._getCurr(++currIndex);
         continue;
       }
-
       if (currEdit === null) {
         this._acceptPrev(prevEdit);
         prevEdit = this._getPrev(++prevIndex);
         continue;
       }
-
```

**Analysis:** The previous-edit, current-edit and result state are visibly grouped in both fields and constructor assignments in the baseline. Jev collapses those groups, apparently classifying all of them as one run of related state initialization. The paired naming scheme is not enough to recover the three conceptual groups from small windows. Later loop setup and early exits lose separation too. The compact-related-statements rule is too broad for algorithms with several parallel state machines.

**Recorded decisions (following code line within excerpt):** before baseline L116: 13% yes, removed; before baseline L119: 13% yes, removed; before baseline L122: 12% yes, removed; before baseline L129: 14% yes, removed; before baseline L132: 9% yes, removed; before baseline L135: 16% yes, removed; before baseline L143: 18% yes, removed; before baseline L146: 34% yes, removed; before baseline L153: 47% yes, removed.

## 16. src/vs/editor/common/editorContextKeys.ts

Whole file: **+21 / −5 = 26 changed lines (6.99%)** of 372 baseline lines.

```diff
@@ -150,43 +158,42 @@
     "",
     nls.localize("diffEditorModifiedUri", "The uri of the modified document"),
   );
-
   export const columnSelection = new RawContextKey<boolean>(
     "editorColumnSelection",
     false,
     nls.localize("editorColumnSelection", "Whether `editor.columnSelection` is enabled"),
   );
+
   export const writable = readOnly.toNegated();
+
   export const hasNonEmptySelection = new RawContextKey<boolean>(
     "editorHasSelection",
     false,
     nls.localize("editorHasSelection", "Whether the editor has text selected"),
   );
   export const hasOnlyEmptySelection = hasNonEmptySelection.toNegated();
   export const hasMultipleSelections = new RawContextKey<boolean>(
     "editorHasMultipleSelections",
     false,
     nls.localize("editorHasMultipleSelections", "Whether the editor has multiple selections"),
   );
   export const hasSingleSelection = hasMultipleSelections.toNegated();
   export const tabMovesFocus = new RawContextKey<boolean>(
     "editorTabMovesFocus",
     false,
     nls.localize("editorTabMovesFocus", "Whether `Tab` will move focus out of the editor"),
   );
   export const tabDoesNotMoveFocus = tabMovesFocus.toNegated();
   export const isInEmbeddedEditor = new RawContextKey<boolean>("isInEmbeddedEditor", false, true);
   export const canUndo = new RawContextKey<boolean>("canUndo", false, true);
   export const canRedo = new RawContextKey<boolean>("canRedo", false, true);
-
   export const hoverVisible = new RawContextKey<boolean>(
     "editorHoverVisible",
     false,
     nls.localize("editorHoverVisible", "Whether the editor hover is visible"),
   );
   export const hoverFocused = new RawContextKey<boolean>(
     "editorHoverFocused",
     false,
     nls.localize("editorHoverFocused", "Whether the editor hover is focused"),
   );
-
```

**Analysis:** Spacing becomes inconsistent across a table of exported context keys. The model removes a break between substantial declarations at 53%, but adds breaks around the short writable alias at 61–62%, while other related aliases remain attached. This suggests local semantic guesses about unrelated declarations competing with compact variable-group rules. A shared policy for the whole run of context-key definitions would be more reliable than separate decisions around each declaration.

**Recorded decisions (following code line within excerpt):** before baseline L154: 53% yes, removed; before baseline L182: 18% yes, removed; before baseline L159: 61% yes, added; before baseline L160: 62% yes, added.

## 17. src/vs/editor/common/languages/linkComputer.ts

Whole file: **+4 / −21 = 25 changed lines (6.78%)** of 369 baseline lines.

```diff
@@ -110,44 +109,34 @@
-
       [State.H, CharCode.t, State.HT],
       [State.H, CharCode.T, State.HT],
-
       [State.HT, CharCode.t, State.HTT],
       [State.HT, CharCode.T, State.HTT],
-
       [State.HTT, CharCode.p, State.HTTP],
       [State.HTT, CharCode.P, State.HTTP],
-
       [State.HTTP, CharCode.s, State.BeforeColon],
       [State.HTTP, CharCode.S, State.BeforeColon],
       [State.HTTP, CharCode.Colon, State.AfterColon],
-
       [State.F, CharCode.i, State.FI],
       [State.F, CharCode.I, State.FI],
-
       [State.FI, CharCode.l, State.FIL],
       [State.FI, CharCode.L, State.FIL],
-
       [State.FIL, CharCode.e, State.BeforeColon],
       [State.FIL, CharCode.E, State.BeforeColon],
-
       [State.BeforeColon, CharCode.Colon, State.AfterColon],
-
       [State.AfterColon, CharCode.Slash, State.AlmostThere],
-
       [State.AlmostThere, CharCode.Slash, State.End],
     ]);
   }
   return _stateMachine;
 }
 
 const enum CharacterClass {
   None = 0,
   ForceTermination = 1,
   CannotEndIn = 2,
 }
 
 let _classifier: CharacterClassifier<CharacterClass> | null = null;
+
 function getClassifier(): CharacterClassifier<CharacterClass> {
   if (_classifier === null) {
     _classifier = new CharacterClassifier<CharacterClass>(CharacterClass.None);
-
```

**Analysis:** The lost state-transition grouping is entirely structural: all ten displayed array-group boundaries have no Noul probability. The production candidate finder handles statements and selected member lists, but not array-element boundaries. Removing all empty lines therefore flattens the author's carefully grouped transition table before Jev can judge it. In contrast, the variable-to-function gap below is submitted and added at 81%. This problem requires candidate-generation changes; prompt tuning cannot solve it.

**Recorded decisions (following code line within excerpt):** before baseline L111: not submitted (structural exclusion), removed; before baseline L114: not submitted (structural exclusion), removed; before baseline L117: not submitted (structural exclusion), removed; before baseline L120: not submitted (structural exclusion), removed; before baseline L124: not submitted (structural exclusion), removed; before baseline L127: not submitted (structural exclusion), removed; before baseline L130: not submitted (structural exclusion), removed; before baseline L133: not submitted (structural exclusion), removed; before baseline L135: not submitted (structural exclusion), removed; before baseline L137: not submitted (structural exclusion), removed; before baseline L150: 81% yes, added.

## 18. src/vs/platform/agentHost/browser/nullAgentHostService.ts

Whole file: **+48 / −2 = 50 changed lines (16.50%)** of 303 baseline lines.

```diff
@@ -225,33 +247,45 @@
+
   async completions(_params: CompletionsParams): Promise<CompletionsResult> {
     return { items: [] };
   }
+
   async listAutomationTriggerDefinitions(
     _params: ListAutomationTriggerDefinitionsParams,
   ): Promise<ListAutomationTriggerDefinitionsResult> {
     return notSupported();
   }
+
   async runAutomation(_params: RunAutomationParams): Promise<RunAutomationResult> {
     return notSupported();
   }
+
   async fetchAutomationRuns(
     _params: FetchAutomationRunsParams,
   ): Promise<FetchAutomationRunsResult> {
     return notSupported();
   }
+
   async getCompletionTriggerCharacters(): Promise<readonly string[]> {
     return [];
   }
+
   async startWebSocketServer(): Promise<IAgentHostSocketInfo> {
     return notSupported();
   }
+
   async getInspectInfo(_tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined> {
     return undefined;
   }
+
   async disposeSession(_session: URI): Promise<void> {}
+
   async createChat(_session: URI, _chat: URI): Promise<void> {
     notSupported();
   }
+
   async disposeChat(_chat: URI): Promise<void> {}
+
   async createTerminal(_params: CreateTerminalParams): Promise<void> {
     notSupported();
   }
+
```

**Analysis:** Every small method is treated as an independent declaration, usually with 75–93% yes. That follows the generic method-spacing policy but misses the original's compact null-object implementation style: many methods only return notSupported, an empty collection or undefined. The extra blanks are not syntax mistakes, yet substantially lengthen a repetitive service stub. The model lacks a file-level decision that this class is a compact implementation catalogue.

**Recorded decisions (following code line within excerpt):** before baseline L225: 92% yes, added; before baseline L228: 89% yes, added; before baseline L233: 93% yes, added; before baseline L236: 90% yes, added; before baseline L241: 93% yes, added; before baseline L244: 83% yes, added; before baseline L247: 84% yes, added; before baseline L250: 75% yes, added; before baseline L251: 87% yes, added; before baseline L254: 60% yes, added; before baseline L255: 74% yes, added.

## 19. src/vs/platform/agentHost/common/webPubSub/chunking.ts

Whole file: **+15 / −15 = 30 changed lines (7.58%)** of 396 baseline lines.

```diff
@@ -143,42 +142,40 @@
   }
+
   const rawBudget = (encodedBudget / 4) * 3;
   const total = Math.ceil(rawBytes.byteLength / rawBudget);
   if (total > DEFAULT_MAX_SEGMENTS_PER_GROUP) {
     throw new ChunkingError(
       `payload requires ${total} chunks, exceeds ${DEFAULT_MAX_SEGMENTS_PER_GROUP}-chunk ceiling`,
     );
   }
 
   const out: ChunkEnvelope[] = new Array<ChunkEnvelope>(total);
+
   for (let i = 0; i < total; i++) {
     const start = i * rawBudget;
     const end = Math.min(start + rawBudget, rawBytes.byteLength);
     const slice = rawBytes.subarray(start, end);
     out[i] = {
       kind: "chunk",
       group_id: groupId,
       seq: i,
       total,
       bytes: bytesToBase64(slice),
     };
   }
+
   return out;
 }
 
 /** Options accepted by {@link Reassembler}. */
 export interface ReassemblerOptions {
   /** Drop partial buffers older than this many milliseconds. */
   readonly timeoutMs?: number;
-
   /** Maximum total decoded bytes a single in-flight group may accumulate. */
   readonly maxBufferBytes?: number;
-
   /** Maximum decoded bytes retained across every in-flight group. */
   readonly maxTotalBufferBytes?: number;
-
   /** Maximum number of concurrent in-flight groups. */
   readonly maxConcurrentGroups?: number;
-
   /** Maximum `total` value the reassembler will accept on any chunked envelope. */
   readonly maxSegmentsPerGroup?: number;
-
```

**Analysis:** The function gains plausible boundaries between validation, allocation, iteration and returning results. The final return lands exactly at the inclusive 55% threshold. Immediately afterward, documented interface properties lose their original separation at 10–16%. The formatter distinguishes methods and execution phases from ordinary fields, even when each field has its own documentation. This yields an expanded function followed by a compressed API list, reflecting the prompt's categories more than the author's visual style.

**Recorded decisions (following code line within excerpt):** before baseline L173: 10% yes, removed; before baseline L176: 11% yes, removed; before baseline L179: 16% yes, removed; before baseline L182: 13% yes, removed; before baseline L144: 83% yes, added; before baseline L153: 73% yes, added; before baseline L165: 55% yes, added.

## 20. src/vs/platform/files/common/diskFileSystemProviderClient.ts

Whole file: **+1 / −29 = 30 changed lines (9.23%)** of 325 baseline lines.

```diff
@@ -239,45 +222,37 @@
   write(
     fd: number,
     pos: number,
     data: Uint8Array,
     offset: number,
     length: number,
   ): Promise<number> {
     return this.channel.call("write", [fd, pos, VSBuffer.wrap(data), offset, length]);
   }
 
   //#endregion
-
   //#region Move/Copy/Delete/Create Folder
-
   mkdir(resource: URI): Promise<void> {
     return this.channel.call("mkdir", [resource]);
   }
 
   delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
     return this.channel.call("delete", [resource, opts]);
   }
 
   rename(resource: URI, target: URI, opts: IFileOverwriteOptions): Promise<void> {
     return this.channel.call("rename", [resource, target, opts]);
   }
 
   copy(resource: URI, target: URI, opts: IFileOverwriteOptions): Promise<void> {
     return this.channel.call("copy", [resource, target, opts]);
   }
 
   //#endregion
-
   //#region Clone File
-
   cloneFile(resource: URI, target: URI): Promise<void> {
     return this.channel.call("cloneFile", [resource, target]);
   }
-
   //#endregion
-
   //#region File Watching
-
   private readonly _onDidChange = this._register(new Emitter<readonly IFileChange[]>());
   readonly onDidChangeFile = this._onDidChange.event;
-
```

**Analysis:** Most removed region spacing was never sent to Jev. The parser treats endregion, the next region label and the following member as leading-comment material, so gaps inside that material and between a label and its member are excluded. One submitted boundary before endregion also scores only 46%. Section markers are being mistaken for ordinary attached documentation. Region-aware grouping is needed to preserve these headings; lowering the global threshold would leave most of this example unchanged.

**Recorded decisions (following code line within excerpt):** before baseline L251: not submitted (structural exclusion), removed; before baseline L253: not submitted (structural exclusion), removed; before baseline L271: not submitted (structural exclusion), removed; before baseline L273: not submitted (structural exclusion), removed; before baseline L277: 46% yes, removed; before baseline L279: not submitted (structural exclusion), removed; before baseline L281: not submitted (structural exclusion), removed.

## 21. src/vs/platform/agentHost/common/meta/vscode/agentUsageMeta.ts

Whole file: **+26 / −0 = 26 changed lines (8.20%)** of 317 baseline lines.

```diff
@@ -133,38 +138,45 @@
 export function readUsageInfoMeta(usage: UsageInfo | undefined): UsageInfoMeta {
   const meta = usage?._meta;
   if (!meta) {
     return {};
   }
+
   const result: Mutable<UsageInfoMeta> = {};
   if (typeof meta.cost === "number") {
     result.cost = meta.cost;
   }
+
   const autoModeResolved = readAutoModeResolvedInfo(meta.autoModeResolved);
   if (autoModeResolved) {
     result.autoModeResolved = autoModeResolved;
   }
+
   const copilotUsage = meta.copilotUsage;
+
   if (copilotUsage && typeof copilotUsage === "object" && !Array.isArray(copilotUsage)) {
     const rawUsage = copilotUsage as Record<string, unknown>;
     const usage: Mutable<NonNullable<UsageInfoMeta["copilotUsage"]>> = {};
     if (typeof rawUsage.totalNanoAiu === "number") {
       usage.totalNanoAiu = rawUsage.totalNanoAiu;
     }
     if (typeof rawUsage.sessionTotalNanoAiu === "number") {
       usage.sessionTotalNanoAiu = rawUsage.sessionTotalNanoAiu;
     }
     result.copilotUsage = usage;
   }
+
   const quotaSnapshots = meta.quotaSnapshots;
   if (quotaSnapshots && typeof quotaSnapshots === "object" && !Array.isArray(quotaSnapshots)) {
     const snapshots: Mutable<NonNullable<UsageInfoMeta["quotaSnapshots"]>> = {};
     for (const [quotaType, value] of Object.entries(quotaSnapshots as Record<string, unknown>)) {
       snapshots[quotaType] = readAccountQuotaSnapshot(value);
     }
     result.quotaSnapshots = snapshots;
   }
+
   const contextAttribution = readContextAttribution(meta.contextAttribution);
+
   if (contextAttribution) {
     result.contextAttribution = contextAttribution;
   }
   const turnTokenTotals = readTurnTokenTotals(meta.turnTokenTotals);
```

**Analysis:** Separating cost, automatic mode, Copilot usage and quota parsing is a plausible improvement: they populate different parts of the result. But Jev also inserts between a local value and its immediate check, notably copilotUsage at exactly 55% and contextAttribution at 68%. That contradicts the compact read/check behavior seen in examples 2 and 7. Nearby completed blocks seem to encourage a phase interpretation even where the two statements form a tight pair.

**Recorded decisions (following code line within excerpt):** before baseline L138: 77% yes, added; before baseline L142: 58% yes, added; before baseline L146: 66% yes, added; before baseline L147: 55% yes, added; before baseline L158: 75% yes, added; before baseline L166: 77% yes, added; before baseline L167: 68% yes, added.

## 22. src/vs/platform/theme/common/sizes/baseSizes.ts

Whole file: **+0 / −24 = 24 changed lines (9.30%)** of 258 baseline lines.

```diff
@@ -185,45 +173,37 @@
   nls.localize("spacingSize20", "Spacing of 2px."),
 );
-
 export const spacingSize40 = registerSize(
   "spacing.size40",
   sizeForAllThemes(4, "px"),
   nls.localize("spacingSize40", "Spacing of 4px."),
 );
-
 export const spacingSize60 = registerSize(
   "spacing.size60",
   sizeForAllThemes(6, "px"),
   nls.localize("spacingSize60", "Spacing of 6px."),
 );
-
 export const spacingSize80 = registerSize(
   "spacing.size80",
   sizeForAllThemes(8, "px"),
   nls.localize("spacingSize80", "Spacing of 8px."),
 );
-
 export const spacingSize100 = registerSize(
   "spacing.size100",
   sizeForAllThemes(10, "px"),
   nls.localize("spacingSize100", "Spacing of 10px."),
 );
-
 export const spacingSize120 = registerSize(
   "spacing.size120",
   sizeForAllThemes(12, "px"),
   nls.localize("spacingSize120", "Spacing of 12px."),
 );
-
 export const spacingSize160 = registerSize(
   "spacing.size160",
   sizeForAllThemes(16, "px"),
   nls.localize("spacingSize160", "Spacing of 16px."),
 );
-
 export const spacingSize200 = registerSize(
   "spacing.size200",
   sizeForAllThemes(20, "px"),
   nls.localize("spacingSize200", "Spacing of 20px."),
 );
-
```

**Analysis:** Each multiline exported size registration was a visually separate entry in the original. Jev rates the intervening gaps 40–46%, apparently treating the repeated calls as one related constant table. This conflicts with its tendency to separate repeated methods elsewhere: both are catalogues, but one is compressed and the other expanded. The prompt does not establish a clear rule for multiline constant registrations versus short consecutive variable declarations.

**Recorded decisions (following code line within excerpt):** before baseline L188: 41% yes, removed; before baseline L194: 46% yes, removed; before baseline L200: 41% yes, removed; before baseline L206: 46% yes, removed; before baseline L212: 42% yes, removed; before baseline L218: 40% yes, removed; before baseline L224: 43% yes, removed.

## 23. src/vs/workbench/contrib/debug/common/nullDebugService.ts

Whole file: **+47 / −2 = 49 changed lines (15.65%)** of 313 baseline lines.

```diff
@@ -236,31 +254,45 @@
+
   async updateBreakpoints(): Promise<void> {}
+
   async enableOrDisableBreakpoints(_enable: boolean, _breakpoint?: IEnablement): Promise<void> {}
   async setBreakpointsActivated(_activated: boolean): Promise<void> {}
+
   async removeBreakpoints(_id?: string | string[]): Promise<void> {}
+
   addFunctionBreakpoint(_opts?: IFunctionBreakpointOptions, _id?: string): void {}
+
   async updateFunctionBreakpoint(
     _id: string,
     _update: { name?: string; hitCondition?: string; condition?: string },
   ): Promise<void> {}
+
   async removeFunctionBreakpoints(_id?: string): Promise<void> {}
+
   async addDataBreakpoint(_opts: IDataBreakpointOptions): Promise<void> {}
+
   async updateDataBreakpoint(
     _id: string,
     _update: { hitCondition?: string; condition?: string },
   ): Promise<void> {}
   async removeDataBreakpoints(_id?: string): Promise<void> {}
+
   async addInstructionBreakpoint(_opts: IInstructionBreakpointOptions): Promise<void> {}
+
   async removeInstructionBreakpoints(
     _instructionReference?: string,
     _offset?: number,
     _address?: bigint,
   ): Promise<void> {}
+
   async setExceptionBreakpointCondition(
     _breakpoint: IExceptionBreakpoint,
     _condition: string | undefined,
   ): Promise<void> {}
+
   setExceptionBreakpointsForSession(
     _session: IDebugSession,
     _filters: DebugProtocol.ExceptionBreakpointsFilter[],
   ): void {}
+
   async sendAllBreakpoints(_session?: IDebugSession): Promise<void> {}
+
```

**Analysis:** The baseline packs empty debug-service methods together. Jev expands most boundaries but leaves a few adjacent stubs touching, such as enableOrDisableBreakpoints/setBreakpointsActivated and updateDataBreakpoint/removeDataBreakpoints. Several additions barely clear the cutoff at 56–60%, while others are much stronger. This exposes a consistency problem even within the chosen expanded style: each boundary is judged independently, so equivalent empty-method patterns do not receive a uniform result.

**Recorded decisions (following code line within excerpt):** before baseline L236: 67% yes, added; before baseline L237: 79% yes, added; before baseline L239: 60% yes, added; before baseline L240: 57% yes, added; before baseline L241: 60% yes, added; before baseline L245: 57% yes, added; before baseline L246: 56% yes, added; before baseline L247: 64% yes, added; before baseline L252: 58% yes, added; before baseline L253: 71% yes, added; before baseline L258: 93% yes, added; before baseline L262: 69% yes, added; before baseline L266: 84% yes, added.

## 24. src/vs/workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.ts

Whole file: **+17 / −8 = 25 changed lines (9.16%)** of 273 baseline lines.

```diff
@@ -122,38 +119,45 @@
       bytes[i] = binary.charCodeAt(i);
     }
+
     const arrayBuf = bytes.buffer;
+
     turn.writeChain = turn.writeChain.then(async () => {
       if (gen !== this._playbackGen) {
         return;
       }
       try {
         const ctx = this.ensureContext(this._window!);
         const decoded = await ctx.decodeAudioData(arrayBuf);
         if (gen !== this._playbackGen) {
           return;
         }
+
         this._writeToPlayBuffer(decoded);
         if (!this._playbackTurn?.started) {
           this._startPlayback();
         }
       } catch (err) {
         this.logService.error("[voice] TTS decode error", err);
       }
     });
+
     if (isFinal) {
       turn.writeChain = turn.writeChain.then(() => this._schedulePlayStop());
     }
   }
 
   stopPlayback(): void {
     this._playbackGen++;
     if (this._playbackTurn) {
       this._captureSamples(this._playbackTurn);
     }
+
     try {
       this._playbackTurn?.sourceNode?.stop();
     } catch {
       /* already stopped */
     }
+
     this._playbackTurn = null;
     this._analyserNode = undefined;
+
```

**Analysis:** The added breaks mostly track real asynchronous phases: byte conversion, queued decoding, playback, finalization, stopping and clearing state. That makes the code more paragraph-like than the original compact style. The gap between arrayBuf and the write-chain callback is more debatable because the callback immediately consumes it. The 55% addition after the generation guard also shows how an inclusive threshold can expand a short guard-to-action pair while similar guards elsewhere remain compact.

**Recorded decisions (following code line within excerpt):** before baseline L124: 78% yes, added; before baseline L125: 67% yes, added; before baseline L135: 55% yes, added; before baseline L143: 65% yes, added; before baseline L153: 70% yes, added; before baseline L158: 67% yes, added.

## 25. src/vs/workbench/contrib/terminal/browser/terminalConfigurationService.ts

Whole file: **+10 / −18 = 28 changed lines (7.93%)** of 353 baseline lines.

```diff
@@ -35,43 +35,40 @@
 // #region TerminalConfigurationService
-
 export class TerminalConfigurationService
   extends Disposable
   implements ITerminalConfigurationService
 {
   declare _serviceBrand: undefined;
-
   protected _fontMetrics: TerminalFontMetrics;
   private _skipTerminalCommands: ReadonlySet<string> = new Set(DEFAULT_COMMANDS_TO_SKIP_SHELL);
-
   protected _config!: Readonly<ITerminalConfiguration>;
+
   get config() {
     return this._config;
   }
 
   get defaultLocation(): TerminalLocation {
     if (this.config.defaultLocation === TerminalLocationConfigValue.Editor) {
       return TerminalLocation.Editor;
     }
     return TerminalLocation.Panel;
   }
 
   private readonly _onConfigChanged = this._register(new Emitter<void>());
+
   get onConfigChanged(): Event<void> {
     return this._onConfigChanged.event;
   }
 
   constructor(
     @IConfigurationService private readonly _configurationService: IConfigurationService,
   ) {
     super();
-
     this._fontMetrics = this._register(new TerminalFontMetrics(this, this._configurationService));
-
     this._register(
       Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e) => {
         if (!e || e.affectsConfiguration(TERMINAL_CONFIG_SECTION)) {
           this._updateConfig();
         }
       }),
     );
   }
```

**Analysis:** The model merges ordinary class fields and constructor initialization but separates fields from their getters at 57% and 63%. That is compatible with generic method spacing, yet splits the tightly coupled backing-field/accessor pairs the original kept adjacent. The blank after the region heading is a structural removal: the heading is attached to the class. A consistent policy should recognize both accessor pairs and section comments rather than treating every method start as a new logical unit.

**Recorded decisions (following code line within excerpt):** before baseline L37: not submitted (structural exclusion), removed; before baseline L43: 24% yes, removed; before baseline L46: 20% yes, removed; before baseline L68: 15% yes, removed; before baseline L70: 25% yes, removed; before baseline L47: 57% yes, added; before baseline L59: 63% yes, added.

## 26. extensions/copilot/src/platform/telemetry/common/telemetry.ts

Whole file: **+21 / −6 = 27 changed lines (7.20%)** of 375 baseline lines.

```diff
@@ -107,38 +107,45 @@
 export type TelemetryDestination = {
   github: boolean | { eventNamePrefix: string };
   microsoft: boolean;
 };
 
 export interface ITelemetryService extends IExperimentationTelemetry, IDisposable {
   readonly _serviceBrand: undefined;
+
   /**
    * Legacy restricted Microsoft telemetry entry point. Sending is disabled;
    * retained so existing callers do not route restricted content through standard telemetry.
    */
   sendInternalMSFTTelemetryEvent(
     eventName: string,
     properties?: TelemetryEventProperties,
     measurements?: TelemetryEventMeasurements,
   ): void;
+
   sendMSFTTelemetryEvent(
     eventName: string,
     properties?: TelemetryEventProperties,
     measurements?: TelemetryEventMeasurements,
   ): void;
+
   sendMSFTTelemetryErrorEvent(
     eventName: string,
     properties?: TelemetryEventProperties,
     measurements?: TelemetryEventMeasurements,
   ): void;
+
   sendGHTelemetryEvent(
     eventName: string,
     properties?: TelemetryEventProperties,
     measurements?: TelemetryEventMeasurements,
   ): void;
+
   sendGHTelemetryErrorEvent(
     eventName: string,
     properties?: TelemetryEventProperties,
     measurements?: TelemetryEventMeasurements,
   ): void;
+
   sendGHTelemetryException(maybeError: unknown, origin: string): void;
+
   /**
```

**Analysis:** These interface method signatures are expanded with 60–80% yes, unlike the interface properties compressed in examples 14 and 19. The model is applying a method-like API spacing rule even though the original kept the signatures together. That interpretation is defensible, but shows the formatter is following syntax categories rather than the repository's compact declaration style. The documentation stays attached correctly; the disagreement is about separation between API entries.

**Recorded decisions (following code line within excerpt):** before baseline L114: 66% yes, added; before baseline L123: 71% yes, added; before baseline L128: 73% yes, added; before baseline L133: 60% yes, added; before baseline L138: 62% yes, added; before baseline L143: 66% yes, added; before baseline L144: 80% yes, added.

## 27. extensions/copilot/src/platform/notebook/common/alternativeContentProvider.xml.ts

Whole file: **+14 / −11 = 25 changed lines (7.76%)** of 322 baseline lines.

```diff
@@ -138,41 +142,43 @@
     const cellIdMap = isNotebook ? getCellIdMap(notebookOrUri) : new Map<string, NotebookCell>();
-
     let index = -1;
     let endDelimiterSeen = false;
     const cellIdsSeen = new Set<string>();
     let previousLineEndedWithEndCellMarker = false;
     let previousLine: LineOfCellText | undefined = undefined;
     const defaultLanguage = isNotebook
       ? getLanguage(getDefaultLanguage(notebookOrUri)).languageId
       : undefined;
+
     for await (const lineOfText of inputStream) {
       if (token.isCancellationRequested) {
         break;
       }
+
       const line = lineOfText.value;
       if (
         (line.startsWith(StartDelimter) || line.startsWith(StartEmptyCellDelimter)) &&
         (index < 0 || endDelimiterSeen || (previousLineEndedWithEndCellMarker && previousLine))
       ) {
         if (!endDelimiterSeen && previousLineEndedWithEndCellMarker && previousLine) {
           // Last line didn't finish, emit that, but strip the end delimiter.
           previousLine.line = previousLine.line.substring(
             0,
             previousLine.line.lastIndexOf(EndDelimter),
           );
           yield previousLine;
           yield { type: "end", index: previousLine.index };
         }
         previousLineEndedWithEndCellMarker = false;
         previousLine = undefined;
-
         index += 1;
         endDelimiterSeen = false;
         const lineOfCellText: LineOfCellText = {
           type: "start",
           index,
           uri: undefined,
           language: undefined,
           kind: NotebookCellKind.Code,
         };
+
         const cellParts = extractCellParts(line, defaultLanguage);
+
```

**Analysis:** Jev adds breaks before the stream-processing loop and after cancellation checking at 56% and 55%, then adds a stronger break before extracting cell parts. At the same time, it removes separation between the lookup map and parser state, and between resetting previous-cell state and advancing the cell index. Those reset/advance groups represent real state-machine phases that look like ordinary adjacent assignments locally. The window is insufficient to consistently recover the protocol's conceptual stages.

**Recorded decisions (following code line within excerpt):** before baseline L140: 23% yes, removed; before baseline L169: 20% yes, removed; before baseline L148: 56% yes, added; before baseline L152: 55% yes, added; before baseline L178: 76% yes, added.

## 28. extensions/copilot/src/platform/configuration/common/validator.ts

Whole file: **+8 / −13 = 21 changed lines (5.71%)** of 368 baseline lines.

```diff
@@ -159,44 +163,40 @@
         const validator = properties[key];
         const fieldValue = (content as any)[key];
-
         // Check if field is required and missing
         const isRequired = validator.isRequired?.() ?? false;
         if (isRequired && fieldValue === undefined) {
           return { content: undefined, error: { message: `Required field '${key}' is missing` } };
         }
 
         // If field is not required and is missing, skip validation
         if (!isRequired && fieldValue === undefined) {
           continue;
         }
-
         const { content: value, error } = validator.validate(fieldValue);
         if (error) {
           return {
             content: undefined,
             error: { message: `Error in property '${key}': ${error.message}` },
           };
         }
-
         result[key] = value;
       }
 
       return { content: result, error: undefined };
     },
+
     toSchema() {
       const requiredFields: string[] = [];
       const schemaProperties: Record<string, JsonSchema> = {};
-
       for (const [key, validator] of Object.entries(properties)) {
         schemaProperties[key] = validator.toSchema();
         if (validator.isRequired?.()) {
           requiredFields.push(key);
         }
       }
 
       const schema: JsonSchema = {
         type: "object",
         properties: schemaProperties,
         ...(requiredFields.length > 0 ? { required: requiredFields } : {}),
       };
-
```

**Analysis:** The boundary between validate and toSchema is strongly separated at 84%, while the validation pipeline is compressed. The gap after the missing-optional-field guard scores 54%, even though the following validate call starts a distinct phase. The removal before the required-field comment also shows that a comment does not reliably cause section spacing. This is another case where the method-level rule is clear but phase-level rules conflict, producing a strong outer structure and weaker internal paragraph structure.

**Recorded decisions (following code line within excerpt):** before baseline L162: 24% yes, removed; before baseline L173: 54% yes, removed; before baseline L181: 39% yes, removed; before baseline L190: 28% yes, removed; before baseline L186: 84% yes, added.

## 29. extensions/copilot/src/platform/workspaceChunkSearch/node/codeSearch/workspaceDiff.ts

Whole file: **+3 / −17 = 20 changed lines (6.90%)** of 290 baseline lines.

```diff
@@ -44,45 +43,35 @@
-
   private static readonly _maxDiffFiles = 10000;
-
   private readonly _repos = new ResourceMap<RepoDiffState>();
-
   private readonly _repoTracker: CodeSearchRepoTracker;
-
   /**
    * Tracks all files that have been changed in the workspace during this session.
    */
   private readonly _locallyChangedFiles = new ResourceSet();
-
   private readonly _onDidChangeDiffFiles = this._register(new Emitter<readonly URI[]>());
   public readonly onDidChangeDiffFiles = this._onDidChangeDiffFiles.event;
-
   private readonly _diffRefreshTimer = this._register(new IntervalTimer());
-
   private readonly _initialized = new DeferredPromise<void>();
   public readonly initialized = this._initialized.p;
 
   constructor(
     repoTracker: CodeSearchRepoTracker,
     @ILogService private readonly _logService: ILogService,
     @IWorkspaceFileIndex private readonly _workspaceFileIndex: IWorkspaceFileIndex,
     @ISimulationTestContext private readonly _simulationTestContext: ISimulationTestContext,
   ) {
     super();
-
     this._repoTracker = repoTracker;
-
     this._register(
       this._repoTracker.onDidAddOrUpdateRepo((repoEntry) => {
         if (repoEntry.status !== CodeSearchRepoStatus.Ready) {
           return;
         }
         const entry = this._repos.get(repoEntry.info.rootUri);
         if (entry) {
           this.refreshRepoDiff(entry);
         } else {
           this.openRepo(repoEntry);
         }
       }),
     );
     this._register(this._repoTracker.onDidRemoveRepo((repo) => this.closeRepo(repo)));
-
```

**Analysis:** The baseline distinguishes constants, repository storage, change tracking, events, timers and initialization readiness. Jev treats them all as closely related fields, removing their gaps at 13–28%; the documentation-led group is closer at 52% but still removed. Constructor setup is compacted similarly. These are semantic subsystem boundaries inside one class, not merely different variable names, but a small local window and a strong compact-fields rule flatten them.

**Recorded decisions (following code line within excerpt):** before baseline L45: 16% yes, removed; before baseline L47: 28% yes, removed; before baseline L49: 18% yes, removed; before baseline L51: 52% yes, removed; before baseline L56: 24% yes, removed; before baseline L59: 23% yes, removed; before baseline L61: 23% yes, removed; before baseline L72: 15% yes, removed; before baseline L74: 20% yes, removed.

## 30. extensions/copilot/src/platform/promptFiles/vscode-node/agentInstructionsLocator.ts

Whole file: **+15 / −3 = 18 changed lines (5.07%)** of 355 baseline lines.

```diff
@@ -256,40 +261,45 @@
     while (true) {
       try {
         const gitFolder = joinPath(current, ".git");
         const gitStat = await this.fileSystemService.stat(gitFolder).then(
           (stat) => stat,
           () => undefined,
         );
+
         const isRepoRoot =
           gitStat !== undefined &&
           ((gitStat.type & FileType.Directory) !== 0 || (gitStat.type & FileType.File) !== 0);
+
         if (isRepoRoot) {
           // Only include the repo root (and any intermediate parents) if the user has explicitly trusted it.
           const trusted = await this.workspaceService.isResourceTrusted(current);
           if (trusted) {
             candidates.push(current);
             return candidates;
           }
+
           logger?.logInfo(
             `Repository root found at ${current.toString()}, but it is not trusted. Skipping parent folder inclusion for this workspace folder.`,
           );
           return [];
         }
       } catch (e) {
         const msg = e instanceof Error ? e.message : String(e);
         logger?.logInfo(`Error checking for repo root at ${current.toString()}: ${msg}`);
         return [];
       }
+
       candidates.push(current);
       const parent = dirname(current);
       // Stop walking up at filesystem root, user home, or already-seen folders.
       if (
         isEqual(current, parent) ||
         current.path === "/" ||
         isEqual(userHome, parent) ||
         seen.has(parent)
       ) {
         break;
       }
       current = parent;
     }
+
```

**Analysis:** The model adds plausible breaks between filesystem probing, repository classification, trust handling and walking to the next parent. However, it also separates isRepoRoot from its immediate if at 57%, despite the general instruction to keep a value with its first check. The preceding classification boundary is exactly 55%. This mixture suggests that completed multiline expressions and control-flow blocks are strong local cues, sometimes overriding the more semantic rule about tightly coupled statements.

**Recorded decisions (following code line within excerpt):** before baseline L263: 55% yes, added; before baseline L266: 57% yes, added; before baseline L273: 67% yes, added; before baseline L283: 66% yes, added.

