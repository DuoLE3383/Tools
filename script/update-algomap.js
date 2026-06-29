import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve();

const definitionsPath = path.join(projectRoot, 'src', 'core', 'algo-definitions.json');
const templatePath = path.join(projectRoot, 'src', 'core', 'mapping.template.js');
const outputPath = path.join(projectRoot, 'src', 'core', 'mapping.js');

console.log('🚀 Starting algorithm map update...');

try {
  // 1. Read the raw JSON definitions
  const definitionsRaw = fs.readFileSync(definitionsPath, 'utf8');
  const definitions = JSON.parse(definitionsRaw);

  // 2. Read the mapping template file
  const template = fs.readFileSync(templatePath, 'utf8');

  // 3. Convert the definitions object to a nicely formatted string
  const definitionsString = JSON.stringify(definitions, null, 2);

  // 4. Replace the placeholder in the template with the definitions string
  const outputContent = template.replace('__ALGO_MAPPING_PLACEHOLDER__', definitionsString);

  // 5. Write the final, updated mapping.js file
  fs.writeFileSync(outputPath, outputContent, 'utf8');

  console.log(`✅ Successfully updated ${path.basename(outputPath)} with ${Object.keys(definitions).length} algorithm definitions.`);
} catch (error) {
  console.error('❌ Failed to update algorithm map:', error);
  process.exit(1);
}