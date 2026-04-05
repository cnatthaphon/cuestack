const fs = require('fs');
const path = require('path');

async function run() {
  const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.test.js'))
    .sort();

  let total = 0, passed = 0, failed = 0;
  const failures = [];

  for (const file of files) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${file}`);
    console.log('='.repeat(60));

    try {
      const tests = require(`./${file}`);
      for (const [name, fn] of Object.entries(tests)) {
        total++;
        try {
          await fn();
          passed++;
          console.log(`  [PASS] ${name}`);
        } catch (e) {
          failed++;
          failures.push({ file, name, error: e.message });
          console.log(`  [FAIL] ${name}: ${e.message}`);
        }
      }
    } catch (e) {
      console.log(`  [ERROR] Module error: ${e.message}`);
      failed++;
      failures.push({ file, name: 'module', error: e.message });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${total} total`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ${f.file} > ${f.name}: ${f.error}`));
  }
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

run();
