import v8 from 'v8';

function mb(n) {
  return Math.round((n / 1024 / 1024) * 100) / 100;
}

const heapStats = v8.getHeapStatistics();
const mem = process.memoryUsage();

console.log('Heap statistics:');
console.table({
  heap_size_limit_MB: mb(heapStats.heap_size_limit),
  total_heap_size_MB: mb(heapStats.total_heap_size),
  total_available_size_MB: mb(heapStats.total_available_size || 0),
});

console.log('\nProcess memory usage:');
console.table({
  rss_MB: mb(mem.rss),
  heapTotal_MB: mb(mem.heapTotal),
  heapUsed_MB: mb(mem.heapUsed),
  external_MB: mb(mem.external),
  arrayBuffers_MB: mb(mem.arrayBuffers || 0),
});

console.log('\nTip: Increase heap with --max-old-space-size=4096 (for ~4GB).');
