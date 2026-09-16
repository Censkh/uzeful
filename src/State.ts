import { uzeContextInternal } from "./Context";

export interface StateKey<T> {
  id: string;
  defaultValueGetter?: () => T;
}

export const createStateKey = <T>(id: string, defaultValueGetter?: () => T): StateKey<T> => ({
  id: `${id}${Math.random().toString(36).substring(2, 8)}`,
  defaultValueGetter: defaultValueGetter,
});

const STATE_KEY_PREFIX = "@state:";
const MEMORY_STATE_KEY_PREFIX = "@memory-state:";

// Isolate-local memory state store
const MEMORY_STATE_STORE = new Map<string, any>();

type StateGetter<T> = () => T;
type StateSetter<T> = (valueOrUpdater: T | ((current: T) => T)) => T;

export const uzeRequestState = <T>(key: StateKey<T>): [StateGetter<T>, StateSetter<T>] => {
  const context = uzeContextInternal();
  const resolvedKey = `${STATE_KEY_PREFIX}${key.id}`;
  const state = context.state as any;

  state[resolvedKey] = state[resolvedKey] ?? key.defaultValueGetter?.();
  return [
    () => state[resolvedKey],
    (valueOrUpdater) => {
      return (state[resolvedKey] =
        typeof valueOrUpdater === "function"
          ? // @ts-ignore
            valueOrUpdater(context.state[resolvedKey])
          : valueOrUpdater);
    },
  ];
};

export const uzeMemoryState = <T>(key: StateKey<T>): [StateGetter<T>, StateSetter<T>] => {
  const resolvedKey = `${MEMORY_STATE_KEY_PREFIX}${key.id}`;

  // Initialize with default value if not exists
  if (!MEMORY_STATE_STORE.has(resolvedKey) && key.defaultValueGetter) {
    MEMORY_STATE_STORE.set(resolvedKey, key.defaultValueGetter());
  }

  return [
    () => MEMORY_STATE_STORE.get(resolvedKey),
    (valueOrUpdater) => {
      const currentValue = MEMORY_STATE_STORE.get(resolvedKey);
      const newValue =
        typeof valueOrUpdater === "function" ? (valueOrUpdater as (current: T) => T)(currentValue) : valueOrUpdater;

      MEMORY_STATE_STORE.set(resolvedKey, newValue);
      return newValue;
    },
  ];
};
