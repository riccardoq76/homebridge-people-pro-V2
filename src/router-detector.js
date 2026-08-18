const { Client } = require('ssh2');

const MAC_REGEX = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

/**
 * Optional presence detection via an Asuswrt(-Merlin) router, queried over SSH. Instead of
 * pinging/ARP-ing each target directly (which can miss devices that go quiet to save battery),
 * this asks the router itself which MAC addresses are currently associated - the router always
 * knows this immediately, no polling of individual devices required.
 *
 * This is purely additive: when a monitored MAC address is found in the router's client list,
 * this writes `lastSuccessfulPing_<mac>` to storage exactly like the ping/ARP mechanism in
 * accessory.js does. Nothing else in the plugin needs to know this data came from the router
 * instead of a direct ping - isActive() and friends just look at "when was this target last
 * seen", regardless of source.
 *
 * NOTE: the exact structure of /tmp/clientlist.json varies across Asuswrt/Asuswrt-Merlin
 * firmware versions and hasn't been verified against every router model. The parser below scans
 * the whole JSON tree for anything that looks like a MAC address rather than assuming one fixed
 * structure, to be resilient to this. If it doesn't find anything on your router, check the log
 * output - it logs a truncated raw sample to help diagnose the real format.
 */
class RouterDetector {
  /**
   * @param {function} log Homebridge logger
   * @param {object} config The `routerDetection` config block
   * @param {object} storage Plugin storage (same instance as platform.storage)
   */
  constructor(log, config, storage) {
    this.log = log;
    this.storage = storage;
    this.host = config.host;
    this.port = config.port || 22;
    this.username = config.username;
    this.password = config.password || undefined;
    this.privateKey = config.privateKey || undefined;
    this.pollInterval = config.pollInterval || 30000;
    this.macTargets = [];
    this.stopped = false;
  }

  /**
   * Sets the list of MAC addresses to watch for. Called once at startup with every MAC-looking
   * target across all configured sensors.
   * @param {string[]} macTargets
   */
  setTargets(macTargets) {
    this.macTargets = macTargets.map((mac) => mac.toLowerCase());
  }

  /**
   * Starts the polling loop. Safe to call once; each poll always reschedules the next one
   * regardless of success or failure, so a single failed SSH connection never permanently stops
   * router-based detection.
   */
  start() {
    if (this.macTargets.length === 0) {
      this.log('Router detection: enabled, but no sensor has a MAC address target to watch. Nothing to do.');
      return;
    }
    this.log(`Router detection: watching ${this.macTargets.length} MAC address(es) via ${this.host}, polling every ${this.pollInterval}ms.`);
    this.poll();
  }

  /** Stops the polling loop (no further SSH connections will be made). */
  stop() {
    this.stopped = true;
  }

  async poll() {
    try {
      const connectedMacs = await this.fetchConnectedMacs();
      const now = Date.now();
      let matchCount = 0;
      this.macTargets.forEach((mac) => {
        if (connectedMacs.includes(mac)) {
          matchCount += 1;
          this.storage.setItemSync(`lastSuccessfulPing_${mac}`, now);
        }
      });
      this.log(`Router detection: poll complete, ${matchCount}/${this.macTargets.length} watched device(s) currently connected.`);
    } catch (e) {
      this.log(`Router detection: error polling router, will retry next cycle: ${e.message}`);
    } finally {
      if (!this.stopped) {
        setTimeout(this.poll.bind(this), this.pollInterval);
      }
    }
  }

  /**
   * Connects over SSH, reads /tmp/clientlist.json and extracts every MAC address found in it.
   * @returns {Promise<string[]>} Lowercased MAC addresses currently connected to the router
   */
  fetchConnectedMacs() {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      const cleanupAndReject = (err) => {
        conn.end();
        reject(err);
      };

      conn.on('ready', () => {
        conn.exec('cat /tmp/clientlist.json', (err, stream) => {
          if (err) {
            cleanupAndReject(err);
            return;
          }
          let stdout = '';
          let stderr = '';
          stream.on('data', (chunk) => {
            stdout += chunk;
          });
          stream.stderr.on('data', (chunk) => {
            stderr += chunk;
          });
          stream.on('close', (code) => {
            conn.end();
            if (code !== 0) {
              reject(new Error(`Router returned exit code ${code} for "cat /tmp/clientlist.json": ${stderr.trim() || '(no error output)'}`));
              return;
            }
            try {
              resolve(this.parseClientList(stdout));
            } catch (parseErr) {
              reject(parseErr);
            }
          });
        });
      });

      conn.on('error', (err) => {
        reject(err);
      });

      conn.connect({
        host: this.host,
        port: this.port,
        username: this.username,
        password: this.password,
        privateKey: this.privateKey,
        readyTimeout: 10000,
      });
    });
  }

  /**
   * Recursively scans a parsed JSON value for object keys that look like MAC addresses. This is
   * deliberately structure-agnostic (rather than assuming a fixed shape for clientlist.json)
   * since the exact format is known to vary between Asuswrt/Asuswrt-Merlin firmware versions.
   * @param {string} raw Raw text output from `cat /tmp/clientlist.json`
   * @returns {string[]} Lowercased MAC addresses found anywhere in the JSON
   */
  parseClientList(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const sample = raw.slice(0, 200).replace(/\s+/g, ' ');
      throw new Error(`Could not parse /tmp/clientlist.json as JSON (got: "${sample}..."): ${e.message}`);
    }

    const macs = new Set();
    const seen = new Set();
    const walk = (value) => {
      if (!value || typeof value !== 'object' || seen.has(value)) {
        return;
      }
      seen.add(value);
      Object.keys(value).forEach((key) => {
        const child = value[key];
        // A MAC-shaped key is only a real connected client if its value looks like a client
        // record (has an "ip" field) - on Asuswrt, /tmp/clientlist.json is wrapped in an outer
        // object keyed by the router's OWN MAC address (grouping clients by band: "2G"/"5G"/
        // "wired_mac"), which would otherwise be picked up as a false "connected" device.
        if (MAC_REGEX.test(key) && child && typeof child === 'object' && 'ip' in child) {
          macs.add(key.toLowerCase());
        }
        walk(child);
      });
    };
    walk(parsed);

    if (macs.size === 0) {
      const sample = raw.slice(0, 200).replace(/\s+/g, ' ');
      this.log(`Router detection: parsed /tmp/clientlist.json successfully but found no MAC addresses in it. Raw sample: "${sample}..."`);
    }

    return Array.from(macs);
  }
}

module.exports = RouterDetector;
