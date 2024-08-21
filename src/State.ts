import { uzeContextInternal } from "./Context";

export interface StateKey<T> {
  id: string;
  defaultValueGetter?: () => T;
}

export const createStateKey = <T>(id: string, defaultValueGetter?: () => T): StateKey<T> => ({
  id,
  defaultValueGetter,
});

const STATE_KEY_PREFIX = "@state:";

type StateGetter<T> = () => T;
type StateSetter<T> = (valueOrUpdater: T | ((current: T) => T)) => void;

export const uzeState = async <T>(key: StateKey<T>): Promise<[StateGetter<T>, StateSetter<T>]> => {
  const context = await uzeContextInternal();
  const resolvedKey = `${STATE_KEY_PREFIX}${key.id}`;
  context.state[resolvedKey] = context.state[resolvedKey] ?? key.defaultValueGetter?.();
  return [
    () => context.state[resolvedKey],
    (valueOrUpdater) => {
      context.state[resolvedKey] =
        typeof valueOrUpdater === "function"
          ? // @ts-ignore
            valueOrUpdater(context.state[resolvedKey])
          : valueOrUpdater;
    },
  ];
};
