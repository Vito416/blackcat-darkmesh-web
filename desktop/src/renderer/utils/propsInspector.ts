import { PropsSchema, isManifestExpression } from "../types/manifest";

export type PropsDiffKind = "added" | "removed" | "changed";

export interface PropsDiffEntry {
  path: string;
  kind: PropsDiffKind;
  before?: unknown;
  after?: unknown;
}

export interface PropsDiffGroups {
  added: PropsDiffEntry[];
  removed: PropsDiffEntry[];
  changed: PropsDiffEntry[];
}

export interface PropsValidationIssue {
  path: string;
  message: string;
}

export interface PropsValidationResult {
  valid: boolean;
  issues: PropsValidationIssue[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cloneValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }

  return value;
};

const createEmptyValue = (schema: PropsSchema | undefined): unknown => {
  if (!schema) {
    return undefined;
  }

  if (schema.default !== undefined) {
    return cloneValue(schema.default);
  }

  const resolvedType = inferType(schema, undefined);

  switch (resolvedType) {
    case "object":
      return {};
    case "array":
      return [];
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      return undefined;
  }
};

const joinPath = (base: string, segment: string): string => {
  if (!base) return segment;
  return segment.startsWith("[") ? `${base}${segment}` : `${base}.${segment}`;
};

const inferType = (schema: PropsSchema | undefined, value: unknown): PropsSchema["type"] | undefined => {
  if (schema?.type) return schema.type;
  if (isManifestExpression(value)) return schema?.type ?? "string";
  if (schema?.properties || schema?.required) return "object";
  if (schema?.items) return "array";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (isPlainObject(value)) return "object";
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? (typeof value as PropsSchema["type"])
    : undefined;
};

export const mergeDefaults = (schema: PropsSchema | undefined, value: unknown): unknown => {
  if (!schema) {
    return cloneValue(value);
  }

  if (isManifestExpression(value)) {
    return cloneValue(value);
  }

  if (isManifestExpression(schema.default)) {
    return cloneValue(schema.default);
  }

  const resolvedType = inferType(schema, value);

  if (resolvedType === "object") {
    const source = isPlainObject(value)
      ? value
      : isPlainObject(schema.default)
        ? (schema.default as Record<string, unknown>)
        : undefined;
    const properties = schema.properties ?? {};
    const result: Record<string, unknown> = {};

    for (const [key, childSchema] of Object.entries(properties)) {
      if (source && Object.prototype.hasOwnProperty.call(source, key)) {
        result[key] = mergeDefaults(childSchema, source[key]);
        continue;
      }

      const nextDefault =
        childSchema.default !== undefined ? mergeDefaults(childSchema, childSchema.default) : mergeDefaults(childSchema, undefined);

      if (nextDefault !== undefined) {
        result[key] = nextDefault;
      }
    }

    if (source) {
      for (const [key, entry] of Object.entries(source)) {
        if (Object.prototype.hasOwnProperty.call(properties, key)) continue;

        if (isPlainObject(schema.additionalProperties)) {
          result[key] = mergeDefaults(schema.additionalProperties, entry);
        } else {
          result[key] = cloneValue(entry);
        }
      }
    }

    if (Object.keys(result).length > 0) {
      return result;
    }

    if (source) {
      return cloneValue(source);
    }

    if (schema.default !== undefined) {
      return cloneValue(schema.default);
    }

    return undefined;
  }

  if (resolvedType === "array") {
    const source = Array.isArray(value)
      ? value
      : Array.isArray(schema.default)
        ? schema.default
        : undefined;

    if (!source) {
      return schema.default !== undefined ? mergeDefaults(schema, schema.default) : undefined;
    }

    return source.map((entry) => (schema.items ? mergeDefaults(schema.items, entry) : cloneValue(entry)));
  }

  if (value !== undefined) {
    return cloneValue(value);
  }

  if (schema.default !== undefined) {
    return cloneValue(schema.default);
  }

  return undefined;
};

export const buildFormValue = (schema: PropsSchema | undefined, value: unknown): unknown => {
  if (!schema) {
    return cloneValue(value);
  }

  if (isManifestExpression(value)) {
    return cloneValue(value);
  }

  if (isManifestExpression(schema.default)) {
    return cloneValue(schema.default);
  }

  const resolvedType = inferType(schema, value);

  if (resolvedType === "object") {
    const source = isPlainObject(value)
      ? value
      : isPlainObject(schema.default)
        ? (schema.default as Record<string, unknown>)
        : {};
    const properties = schema.properties ?? {};
    const result: Record<string, unknown> = {};

    for (const [key, childSchema] of Object.entries(properties)) {
      result[key] = buildFormValue(childSchema, Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined);
    }

    for (const [key, entry] of Object.entries(source)) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) continue;

      if (isPlainObject(schema.additionalProperties)) {
        result[key] = buildFormValue(schema.additionalProperties, entry);
      } else {
        result[key] = cloneValue(entry);
      }
    }

    return result;
  }

  if (resolvedType === "array") {
    const source = Array.isArray(value)
      ? value
      : Array.isArray(schema.default)
        ? schema.default
        : [];

    return source.map((entry) => (schema.items ? buildFormValue(schema.items, entry) : cloneValue(entry)));
  }

  if (value !== undefined) {
    return cloneValue(value);
  }

  return createEmptyValue(schema);
};

export const validate = (schema: PropsSchema | undefined, value: unknown): PropsValidationResult => {
  const issues: PropsValidationIssue[] = [];

  const walk = (currentSchema: PropsSchema | undefined, currentValue: unknown, path: string) => {
    if (!currentSchema) return;

    if (isManifestExpression(currentValue)) {
      if (!currentValue.__expr.trim()) {
        issues.push({ path, message: `${path || "Expression"} cannot be empty` });
      }
      return;
    }

    const resolvedType = inferType(currentSchema, currentValue);

    if (resolvedType === "object") {
      if (!isPlainObject(currentValue)) {
        issues.push({ path, message: `${path || "Props"} must be an object` });
        return;
      }

      const properties = currentSchema.properties ?? {};
      const required = new Set(currentSchema.required ?? []);

      for (const requiredKey of required) {
        if (!(requiredKey in currentValue)) {
          issues.push({
            path: joinPath(path, requiredKey),
            message: `${joinPath(path, requiredKey) || requiredKey} is required`,
          });
        }
      }

      for (const [key, childValue] of Object.entries(currentValue)) {
        const childSchema = properties[key];

        if (!childSchema) {
          if (currentSchema.additionalProperties === false) {
            issues.push({
              path: joinPath(path, key),
              message: `${joinPath(path, key)} is not allowed`,
            });
          } else if (isPlainObject(currentSchema.additionalProperties)) {
            walk(currentSchema.additionalProperties, childValue, joinPath(path, key));
          }
          continue;
        }

        walk(childSchema, childValue, joinPath(path, key));
      }

      return;
    }

    if (resolvedType === "array") {
      if (!Array.isArray(currentValue)) {
        issues.push({ path, message: `${path || "Props"} must be an array` });
        return;
      }

      if (typeof currentSchema.minItems === "number" && currentValue.length < currentSchema.minItems) {
        issues.push({
          path,
          message: `${path || "Props"} needs at least ${currentSchema.minItems} item${currentSchema.minItems === 1 ? "" : "s"}`,
        });
      }

      if (typeof currentSchema.maxItems === "number" && currentValue.length > currentSchema.maxItems) {
        issues.push({
          path,
          message: `${path || "Props"} can have at most ${currentSchema.maxItems} item${currentSchema.maxItems === 1 ? "" : "s"}`,
        });
      }

      currentValue.forEach((entry, index) => {
        if (currentSchema.items) {
          walk(currentSchema.items, entry, joinPath(path, `[${index}]`));
        }
      });
      return;
    }

    if (resolvedType === "string") {
      if (typeof currentValue !== "string") {
        issues.push({ path, message: `${path || "Props"} must be a string` });
        return;
      }
    } else if (resolvedType === "number") {
      if (typeof currentValue !== "number" || Number.isNaN(currentValue) || !Number.isFinite(currentValue)) {
        issues.push({ path, message: `${path || "Props"} must be a number` });
        return;
      }
    } else if (resolvedType === "boolean") {
      if (typeof currentValue !== "boolean") {
        issues.push({ path, message: `${path || "Props"} must be a boolean` });
        return;
      }
    } else if (resolvedType === "null") {
      if (currentValue !== null) {
        issues.push({ path, message: `${path || "Props"} must be null` });
        return;
      }
    }

    if (currentSchema.enum && currentSchema.enum.length > 0) {
      const allowed = currentSchema.enum.some((entry) => Object.is(entry, currentValue));
      if (!allowed) {
        issues.push({
          path,
          message: `${path || "Props"} must match one of the allowed values`,
        });
      }
    }
  };

  walk(schema, value, "");

  return {
    valid: issues.length === 0,
    issues,
  };
};

export const groupDiffEntries = (entries: PropsDiffEntry[]): PropsDiffGroups =>
  entries.reduce<PropsDiffGroups>(
    (acc, entry) => {
      acc[entry.kind].push(entry);
      return acc;
    },
    { added: [], removed: [], changed: [] },
  );

export const indexValidationIssues = (issues: PropsValidationIssue[]): Map<string, PropsValidationIssue[]> => {
  const grouped = new Map<string, PropsValidationIssue[]>();

  for (const issue of issues) {
    const current = grouped.get(issue.path) ?? [];
    current.push(issue);
    grouped.set(issue.path, current);
  }

  return grouped;
};

export const diff = (before: unknown, after: unknown, path = ""): PropsDiffEntry[] => {
  if (isManifestExpression(before) || isManifestExpression(after)) {
    if (isManifestExpression(before) && isManifestExpression(after) && before.__expr === after.__expr) {
      return [];
    }
    return [{ path, kind: "changed", before, after }];
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const entries: PropsDiffEntry[] = [];
    const maxLength = Math.max(before.length, after.length);

    for (let index = 0; index < maxLength; index += 1) {
      const nextPath = joinPath(path, `[${index}]`);

      if (index >= before.length) {
        entries.push({ path: nextPath, kind: "added", after: after[index] });
        continue;
      }

      if (index >= after.length) {
        entries.push({ path: nextPath, kind: "removed", before: before[index] });
        continue;
      }

      entries.push(...diff(before[index], after[index], nextPath));
    }

    return entries;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const entries: PropsDiffEntry[] = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of Array.from(keys).sort((left, right) => left.localeCompare(right))) {
      const nextPath = joinPath(path, key);

      if (!(key in after)) {
        entries.push({ path: nextPath, kind: "removed", before: before[key] });
        continue;
      }

      if (!(key in before)) {
        entries.push({ path: nextPath, kind: "added", after: after[key] });
        continue;
      }

      entries.push(...diff(before[key], after[key], nextPath));
    }

    return entries;
  }

  if (Array.isArray(before) || Array.isArray(after) || isPlainObject(before) || isPlainObject(after)) {
    return [{ path, kind: "changed", before, after }];
  }

  if (!Object.is(before, after)) {
    return [{ path, kind: "changed", before, after }];
  }

  return [];
};
