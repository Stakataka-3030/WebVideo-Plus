(() => {
  const requestedMiB = __CUBISM_CORE_MEMORY_MIB__;
  const state = globalThis.__webvideoCubismMemory = {
    requestedMiB, effectiveMiB: 0, done: false, coreLoaded: false, applied: false, engineReservations: [], error: ''
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
              initialize.call(memory, requestedMiB * 1024 * 1024);
              state.effectiveMiB = requestedMiB;
              // 4.6.6 reserves 32 MiB after plugin load and may apply the game config later.
              // An explicit export choice wins. Do not reinitialize Core after allocation:
              // later reserve calls must not reset an active model's backing buffer.
              const preserveExplicitMemory = bytes => {
                state.engineReservations.push(Number(bytes) / (1024 * 1024));
              };
              memory.initializeAmountOfMemory = preserveExplicitMemory;
              if (memory.initializeAmountOfMemory !== preserveExplicitMemory)
                throw new Error('无法固定显式 Cubism Core 初始内存');
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
