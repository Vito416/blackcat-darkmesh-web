export type ManifestPrimitive = string | number | boolean | null;

export interface ManifestExpression {
  __expr: string;
}

export type ManifestValue = ManifestPrimitive | ManifestExpression | ManifestValue[] | ManifestShape;

export type ManifestShape = {
  [key: string]: ManifestValue;
};

export const isManifestExpression = (value: unknown): value is ManifestExpression =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.prototype.hasOwnProperty.call(value as Record<string, unknown>, "__expr") &&
  typeof (value as Record<string, unknown>).__expr === "string";

export type PropsSchemaType = "string" | "number" | "boolean" | "null" | "object" | "array";

export interface PropsSchema {
  type?: PropsSchemaType;
  title?: string;
  description?: string;
  default?: ManifestValue;
  enum?: ManifestPrimitive[];
  properties?: Record<string, PropsSchema>;
  required?: string[];
  items?: PropsSchema;
  additionalProperties?: boolean | PropsSchema;
  minItems?: number;
  maxItems?: number;
}

export interface ManifestNode {
  id: string;
  type: string;
  title: string;
  props: ManifestShape;
  children?: ManifestNode[];
}

export interface ManifestMetadata {
  author?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManifestDocument {
  id: string;
  name: string;
  version: string;
  entry?: string;
  metadata: ManifestMetadata;
  nodes: ManifestNode[];
}

export interface ManifestDraft {
  id?: number;
  name: string;
  document: ManifestDocument;
  createdAt: string;
  updatedAt: string;
  versionStamp?: number;
}

export interface CatalogItem {
  id: string;
  type: string;
  name: string;
  summary: string;
  tags?: string[];
  defaultProps?: ManifestShape;
  propsSchema?: PropsSchema;
}
