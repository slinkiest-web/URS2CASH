/**
 * Introspects a category's Zod attribute schema into a generic field
 * descriptor list, so the listing form can render fields dynamically
 * (PRD §10 Epic B1 AC3) instead of hardcoding a component per category.
 *
 * `condition` is excluded — the form's condition selector handles it
 * separately (src/lib/categories/registry.ts's `allowedConditions`).
 */
import { z } from "zod";

export type FieldDescriptor =
  | { kind: "string"; name: string; required: boolean }
  | { kind: "number"; name: string; required: boolean }
  | { kind: "boolean"; name: string; required: boolean }
  | { kind: "date"; name: string; required: boolean }
  | { kind: "enum"; name: string; required: boolean; options: string[] }
  | { kind: "enum-array"; name: string; required: boolean; options: string[] }
  | { kind: "string-array"; name: string; required: boolean }
  | { kind: "object"; name: string; required: boolean; fields: FieldDescriptor[] }
  | { kind: "unknown"; name: string; required: boolean };

function unwrap(schema: z.ZodTypeAny): { inner: z.ZodTypeAny; required: boolean } {
  let required = true;
  let current: z.ZodTypeAny = schema;

  while (true) {
    if (current instanceof z.ZodOptional) {
      required = false;
      current = current.unwrap();
    } else if (current instanceof z.ZodDefault) {
      required = false;
      current = current.removeDefault();
    } else if (current instanceof z.ZodNullable) {
      current = current.unwrap();
    } else {
      break;
    }
  }

  return { inner: current, required };
}

function describeField(name: string, fieldSchema: z.ZodTypeAny): FieldDescriptor {
  const { inner, required } = unwrap(fieldSchema);

  if (inner instanceof z.ZodEnum) {
    return { kind: "enum", name, required, options: inner.options as string[] };
  }
  if (inner instanceof z.ZodArray) {
    const element = unwrap(inner.element as z.ZodTypeAny).inner;
    if (element instanceof z.ZodEnum) {
      return { kind: "enum-array", name, required, options: element.options as string[] };
    }
    if (element instanceof z.ZodString) {
      return { kind: "string-array", name, required };
    }
    return { kind: "unknown", name, required };
  }
  if (inner instanceof z.ZodObject) {
    const fields = Object.entries(inner.shape as Record<string, z.ZodTypeAny>).map(([key, value]) =>
      describeField(key, value)
    );
    return { kind: "object", name, required, fields };
  }
  if (inner instanceof z.ZodBoolean) {
    return { kind: "boolean", name, required };
  }
  if (inner instanceof z.ZodNumber) {
    return { kind: "number", name, required };
  }
  if (inner instanceof z.ZodDate) {
    return { kind: "date", name, required };
  }
  if (inner instanceof z.ZodString) {
    return { kind: "string", name, required };
  }
  return { kind: "unknown", name, required };
}

/** Returns every attribute field for a category, excluding `condition`. */
export function getAttributeFieldDescriptors(schema: z.ZodTypeAny): FieldDescriptor[] {
  let current: z.ZodTypeAny = schema;
  while (current instanceof z.ZodEffects) {
    current = current.innerType();
  }

  if (!(current instanceof z.ZodObject)) {
    return [];
  }

  return Object.entries(current.shape as Record<string, z.ZodTypeAny>)
    .filter(([key]) => key !== "condition")
    .map(([key, value]) => describeField(key, value));
}
