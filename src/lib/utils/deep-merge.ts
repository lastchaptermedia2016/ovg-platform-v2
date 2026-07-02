type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export interface DeepMergeOptions {
  mergeArrays?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.constructor === Object
  );
}

export function deepMerge<T extends object>(
  target: T,
  source: DeepPartial<T>,
  options: DeepMergeOptions = {}
): T {
  const { mergeArrays = false } = options;

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = (source as Record<string, unknown>)[key];
      const targetValue = (target as Record<string, unknown>)[key];

      if (Array.isArray(sourceValue)) {
        if (mergeArrays && Array.isArray(targetValue)) {
          (target as Record<string, unknown>)[key] = [
            ...targetValue,
            ...sourceValue,
          ];
        } else {
          (target as Record<string, unknown>)[key] = sourceValue;
        }
      } else if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        deepMerge(targetValue, sourceValue as DeepPartial<object>, options);
      } else {
        (target as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }

  return target;
}
