export function metrics(
  labels: ArrayLike<number>,
  scores: ArrayLike<number>,
  threshold: number,
) {
  if (labels.length !== scores.length || !labels.length)
    throw new Error("Nonempty aligned labels and scores required");
  let tp = 0,
    tn = 0,
    fp = 0,
    fn = 0,
    loss = 0,
    brier = 0;
  const bins = Array.from({ length: 1001 }, () => ({
    positive: 0,
    negative: 0,
  }));
  for (let i = 0; i < labels.length; i++) {
    const y = labels[i],
      p = scores[i];
    if ((y !== 0 && y !== 1) || !Number.isFinite(p) || p < 0 || p > 1)
      throw new Error("Invalid probability or label");
    if (p >= threshold) {
      if (y) tp++;
      else fp++;
    } else if (y) fn++;
    else tn++;
    const clipped = Math.max(1e-7, Math.min(1 - 1e-7, p));
    loss -= y * Math.log(clipped) + (1 - y) * Math.log(1 - clipped);
    brier += (p - y) ** 2;
    bins[Math.round(p * 1000)][y ? "positive" : "negative"]++;
  }
  let seenP = 0,
    seenN = 0,
    ap = 0,
    auc = 0,
    lastRecall = 0,
    lastFpr = 0;
  for (let i = bins.length - 1; i >= 0; i--) {
    seenP += bins[i].positive;
    seenN += bins[i].negative;
    const recall = seenP / (tp + fn || 1),
      fpr = seenN / (tn + fp || 1);
    if (seenP + seenN) ap += ((recall - lastRecall) * seenP) / (seenP + seenN);
    auc += ((fpr - lastFpr) * (recall + lastRecall)) / 2;
    lastRecall = recall;
    lastFpr = fpr;
  }
  return {
    examples: labels.length,
    threshold,
    tp,
    tn,
    fp,
    fn,
    accuracy: (tp + tn) / labels.length,
    precision: tp / (tp + fp || 1),
    recall: tp / (tp + fn || 1),
    f1: (2 * tp) / (2 * tp + fp + fn || 1),
    specificity: tn / (tn + fp || 1),
    logLoss: loss / labels.length,
    brier: brier / labels.length,
    approximatePrAuc: ap,
    approximateRocAuc: auc,
  };
}
export function chooseThreshold(
  labels: ArrayLike<number>,
  scores: ArrayLike<number>,
) {
  let best = metrics(labels, scores, 0.5);
  for (let t = 5; t <= 95; t += 1) {
    const candidate = metrics(labels, scores, t / 100);
    if (candidate.f1 > best.f1 + 1e-8) best = candidate;
  }
  return best;
}
