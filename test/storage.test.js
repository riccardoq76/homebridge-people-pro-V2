/**
 * Tests for the custom JSON storage module that replaced node-persist (see src/storage.js and
 * ROADMAP.md 1.1). Each test gets its own temp directory so tests can't interfere with each
 * other, and storage.js is required fresh each time via jest.resetModules() since it exports a
 * singleton that keeps state in memory.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('storage', () => {
  let tmpDir;
  let storage;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'people-pro-storage-test-'));
    jest.resetModules();
    // eslint-disable-next-line global-require
    storage = require('../src/storage');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates the storage directory and an empty data file on first init', () => {
    const dir = path.join(tmpDir, 'plugin-persist');
    storage.initSync({ dir });
    expect(fs.existsSync(dir)).toBe(true);
    expect(storage.getItemSync('anything')).toBeUndefined();
  });

  test('setItemSync persists a value that getItemSync can read back', () => {
    storage.initSync({ dir: tmpDir });
    storage.setItemSync('lastSuccessfulPing_1.2.3.4', 12345);
    expect(storage.getItemSync('lastSuccessfulPing_1.2.3.4')).toBe(12345);
  });

  test('data survives a re-init from the same directory (simulates a Homebridge restart)', () => {
    storage.initSync({ dir: tmpDir });
    storage.setItemSync('foo', 42);

    jest.resetModules();
    // eslint-disable-next-line global-require
    const reloadedStorage = require('../src/storage');
    reloadedStorage.initSync({ dir: tmpDir });
    expect(reloadedStorage.getItemSync('foo')).toBe(42);
  });

  test('a corrupted data file is handled gracefully (starts empty, does not throw)', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{not valid json', 'utf8');

    expect(() => storage.initSync({ dir: tmpDir })).not.toThrow();
    expect(storage.getItemSync('foo')).toBeUndefined();
  });
});
