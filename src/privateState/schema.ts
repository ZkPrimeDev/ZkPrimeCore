import { PrivateSchema } from './privateStateClient';

export function validateSchema(schema: PrivateSchema) {
  if (!schema.name) throw new Error('Schema must have a name');
  if (!Array.isArray(schema.fields) || schema.fields.length === 0) throw new Error('Schema must define at least one field');
  for (const f of schema.fields) {
    if (!f.name || !f.type) throw new Error('Field must have name and type');
  }
  return true;
}

export function serializeRecord(schema: PrivateSchema, record: Record<string, any>): Uint8Array {
  // Simple serialization: JSON string -> UTF8. For production, use canonical encoding.
  const allowed = new Set(schema.fields.map((f: any) => f.name));
  const filtered: Record<string, any> = {};
  for (const k of Object.keys(record)) {
    if (allowed.has(k)) filtered[k] = record[k];
  }
  const json = JSON.stringify(filtered);
  return Buffer.from(json, 'utf8');
}
