# Tree model improvement protocol (2026-10-16)

This protocol is committed to the run's output before training. The existing teacher labels, tokenizer vocabulary, encoded examples, and train/validation/test membership stay fixed. All training inputs are tokens only: neither original whitespace, target labels, repository names nor split identifiers are model inputs.

## Predeclared search

Four configurations, seed 42, up to 40 epochs each:

1. Original 24-dimensional / 32-channel CNN, trained longer with AdamW and validation-loss learning-rate reduction.
2. Wider 64-dimensional / 96-channel CNN, 256 hidden units and 32 nearest raw embeddings per side.
3. Contextual CNN: three shared 96-channel convolutions, dilation 1/2/4, 64-dimensional embeddings, 256 hidden units; retains 16 nearest contextual vectors as well as 32 nearest raw embeddings. This models identifier byte sequences before pooling.
4. Same contextual architecture with stronger dropout and weight decay.

All use full training data each epoch, binary cross entropy, gradient clipping, and validation-log-loss checkpointing. Reduce LR after two stagnant epochs, early stop after eight stagnant epochs (minimum 12 epochs), up to 40 epochs. The original five-epoch checkpoint is an eligible fallback.

Rank architectures by validation log loss, never test scores. Train two additional seeds (123 and 2026) of the winning new architecture under the same budget. Compare its three-seed probability ensemble with individual checkpoints using validation log loss; prefer the simplest candidate within 0.0005 log loss. Choose its classification threshold by validation F1 on the fixed 0.05–0.95 grid. Record a final selection before opening test.bin once for final evaluation. Do not add experiments or alter hyperparameters in response to test results.

## Integrity and reporting

- Hash the encoded manifest and protocol; record all configurations, seeds, histories, selected epochs and training times.
- Read only train.bin and eval.bin during experiments. The official validation set is a development set used for ordinary model selection, not an unbiased performance estimate. A bounded search limits repeated-selection effects.
- The existing test baseline has already been reported. Do not inspect test examples, errors, or intermediate candidate test scores. Final test results may still reflect the original corpus's limitations (global exact deduplication, no near-duplicate clustering, TypeScript-only labels).
- Validate Python/TFJS export parity using training examples, then measure CPU speed on training-file inputs. Neither parity nor speed measurements may change model selection based on test performance.
- Preserve the prior production artifacts. Report quality, parameter count, size, training cost and speed honestly, including regressions. This is a finite experiment budget, not a claim to have found a mathematical global optimum.
