(() => {
  const requestedMiB = __CUBISM_CORE_MEMORY_MIB__;
  const state = globalThis.__webvideoCubismMemory = {
    requestedMiB, done: false, coreLoaded: false, applied: false, error: ''
  };
  let live2dPromise;
  Object.defineProperty(globalThis, 'live2dPromise', {
    configurable: true,
    enumerable: true,
    get() { return live2dPromise; },
    set(value) {
      live2dPromise = Promise.resolve(value).then(result => {
        try {
          state.coreLoaded = !!result?.[1] && !!globalThis.Live2DCubismCore;
          if (state.coreLoaded) {
            const memory = globalThis.Live2DCubismCore.Memory;
            const initialize = memory?.initializeAmountOfMemory;
            if (typeof initialize !== 'function') {
              state.error = '当前 Cubism Core 未提供初始内存接口';
            } else {
              memory.initializeAmountOfMemory(requestedMiB * 1024 * 1024);
              state.applied = true;
            }
          }
        } catch (error) {
          state.error = String(error?.message || error);
        } finally {
          state.done = true;
        }
        return result;
      }, error => {
        state.error = String(error?.message || error);
        state.done = true;
        throw error;
      });
    }
  });
})();
