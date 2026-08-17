require('dotenv').config();
const store = require('./src/store');

async function run() {
  await store.initStore();
  console.log('Clearing memory...');
  await store.clearQueueState();
  console.log('Reset complete!');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
