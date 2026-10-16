// Keep native CPU thread pools bounded on shared developer machines.
process.env.TF_CPP_MIN_LOG_LEVEL ??= "2";
process.env.TF_NUM_INTRAOP_THREADS ??= "8";
process.env.TF_NUM_INTEROP_THREADS ??= "2";
process.env.OMP_NUM_THREADS ??= "8";
// tfjs-node 4.x still calls util helpers removed in recent Node releases.
// Also needed in published installations, where the workspace pnpm patch is absent.
const { default: util } = await import("node:util");
const legacy = util as typeof util & { isNullOrUndefined?: (value: unknown) => boolean; isArray?: typeof Array.isArray };
legacy.isNullOrUndefined ??= value => value === null || value === undefined;
legacy.isArray ??= Array.isArray;
export const tf = await import("@tensorflow/tfjs-node");
