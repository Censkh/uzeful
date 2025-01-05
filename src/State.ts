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

type StateGetter<T> = () => T;
type StateSetter<T> = (valueOrUpdater: T | ((current: T) => T)) => T;

export const uzeState = <T>(key: StateKey<T>): [StateGetter<T>, StateSetter<T>] => {
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
