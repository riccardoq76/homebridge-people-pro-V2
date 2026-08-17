const fs = require('fs');
const path = require('path');

/**
 * Minimal drop-in replacement for the `node-persist` API this plugin actually uses
 * (`initSync`/`getItemSync`/`setItemSync`). The data this plugin stores is trivial - just
 * numeric timestamps keyed by target - so a single JSON file kept in memory and rewritten on
 * every write is enough, without depending on a library that has been unmaintained since 2016.
 *
 * Exported as a singleton instance (like `node-persist` itself is, since `require()` caches
 * modules), so every file that requires this module shares the same in-memory data and the
 * same underlying file.
 */
class Storage {
  constructor() {
    this.data = {};
    this.filePath = null;
  }

  /**
   * Loads (or creates) the storage directory and file.
   * @param {object} options
   * @param {string} options.dir The directory to store the data file in
   */
  initSync({ dir }) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, 'data.json');

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.data = raw ? JSON.parse(raw) : {};
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[homebridge-people-pro] Could not read/parse storage file at ${this.filePath}, starting with empty storage: ${e.message}`);
        this.data = {};
      }
    } else {
      this.data = {};
    }
  }

  /**
   * @param {string} key
   * @returns {*} The stored value for this key, or undefined if not set
   */
  getItemSync(key) {
    return this.data[key];
  }

  /**
   * @param {string} key
   * @param {*} value
   */
  setItemSync(key, value) {
    this.data[key] = value;
    this.persist();
  }

  /**
   * Synchronously rewrites the whole data file. Sync on purpose: Node is single-threaded, so
   * this can never race with another write from this same process.
   */
  persist() {
    if (!this.filePath) {
      return;
    }
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data), 'utf8');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[homebridge-people-pro] Could not write storage file at ${this.filePath}: ${e.message}`);
    }
  }
}

module.exports = new Storage();
