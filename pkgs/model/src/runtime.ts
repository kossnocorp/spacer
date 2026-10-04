// Keep native CPU thread pools bounded on shared developer machines.
process.env.TF_CPP_MIN_LOG_LEVEL ??= "2";
process.env.TF_NUM_INTRAOP_THREADS ??= "8";
process.env.TF_NUM_INTEROP_THREADS ??= "2";
process.env.OMP_NUM_THREADS ??= "8";
export const tf = await import("@tensorflow/tfjs-node");
