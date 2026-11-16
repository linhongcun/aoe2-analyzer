import { readFileSync } from 'node:fs';
import { createSchemaCompiler, SCHEMA_ID_BASE } from './content-schema.mjs';

// Explicit caller for sources, snapshots, migration maps and audit reports.
// The normal content scanner deliberately only visits data/content + data/game.
const compiler = createSchemaCompiler({ schemaFiles: ['common.defs.json', 'content-civ-updates.json'] });
const documents = JSON.parse(readFileSync(0, 'utf8'));
for (const { file, definition, value } of documents) {
  const validate = compiler.getSchema(`${SCHEMA_ID_BASE}content-civ-updates.json#/$defs/${definition}`);
  if (!validate) throw new Error(`Unknown civilization-history schema definition: ${definition}`);
  if (!validate(value)) {
    const errors = (validate.errors ?? [])
      .slice(0, 5)
      .map((error) => `${error.instancePath || '/'} ${error.message}`)
      .join('; ');
    throw new Error(`${file}: ${errors}`);
  }
}
