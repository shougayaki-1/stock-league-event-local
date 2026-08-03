type Listener = () => void;

const listeners = new Set<Listener>();
let activeOperations = 0;

const notify = () => listeners.forEach((listener) => listener());

export const beginCriticalOperation = () => {
  activeOperations += 1;
  notify();
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeOperations = Math.max(0, activeOperations - 1);
    notify();
  };
};

export const isCriticalOperationActive = () => activeOperations > 0;

export const subscribeCriticalOperations = (listener: Listener) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
