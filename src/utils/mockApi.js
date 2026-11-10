// Simulated API layer with configurable delays
// Supports the smart loading strategy: <1s nothing, 1-10s skeleton, >10s progress

let networkDelay = 800; // Default: under 1s for snappy feel

export const setNetworkDelay = (ms) => {
  networkDelay = ms;
};

export const getNetworkDelay = () => networkDelay;

// Simulate API call with delay
export const simulateApi = (data, customDelay = null) => {
  const delay = customDelay ?? networkDelay;
  return new Promise((resolve) => {
    setTimeout(() => resolve(structuredClone(data)), delay);
  });
};

// Simulate API call that can report progress
export const simulateApiWithProgress = (data, onProgress, customDelay = null) => {
  const delay = customDelay ?? networkDelay;
  return new Promise((resolve) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / delay, 1);
      onProgress?.(progress, delay - elapsed);
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      onProgress?.(1, 0);
      resolve(structuredClone(data));
    }, delay);
  });
};

// Simulate optimistic update (instant local, delayed server sync)
export const optimisticUpdate = async (localUpdate, serverSync) => {
  // Apply local update immediately
  localUpdate();

  // Sync to server in background (fire-and-forget)
  try {
    await new Promise((resolve) => setTimeout(resolve, networkDelay));
    serverSync?.();
    return { success: true };
  } catch (error) {
    // In real app, would rollback the local update
    console.error('Server sync failed:', error);
    return { success: false, error };
  }
};
