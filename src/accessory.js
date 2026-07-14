const ping = require('ping');
const { Resolver } = require('dns');
const arp = require('node-arp');
const find = require('local-devices');

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

class PeopleProAccessory {
  constructor(log, config, platform) {
    this.log = log;
    this.name = config.name || 'People Sensor';
    this.type = 'motion';
    if (typeof config.type !== 'undefined' && config.type !== null) {
      if (typeof config.type !== 'string' || (config.type !== 'motion' && config.type !== 'occupancy')) {
        log(`Type "${config.type}" for sensor ${config.name} is invalid. Defaulting to "motion".`);
      } else {
        this.type = config.type;
      }
    } else {
      log(`Type "${config.type}" for sensor ${config.name} is invalid. Defaulting to "motion".`);
    }
    this.target = config.target;
    if (!this.target) {
      log(`No target was given for ${config.name}. Defaulting to "127.0.0.1".`);
      this.target = '127.0.0.1';
    }
    if (config.enableCustomDns !== false) {
      this.customDns = config.customDns || false;
      if (typeof this.customDns !== 'boolean' && !Array.isArray(this.customDns)) {
        this.customDns = [this.customDns];
      }
    } else this.customDns = false;
    this.excludeFromWebhook = config.excludeFromWebhook || false;
    this.platform = platform;
    this.threshold = config.threshold || this.platform.threshold;
    this.pingInterval = config.pingInterval || this.platform.pingInterval;
    this.stateCache = false;
    this.pingUseArp = ((typeof (config.pingUseArp) !== 'undefined' && config.pingUseArp !== null) ? config.pingUseArp : false);

    // Set services and characteristics based on configured sensor type
    if (this.type === 'motion') {
      this.service = new Service.MotionSensor(this.name);
      this.service
        .getCharacteristic(Characteristic.MotionDetected)
        .on('get', this.getState.bind(this));

      class LastActivationCharacteristic extends Characteristic {
        constructor() {
          super('LastActivation', 'E863F11A-079E-48FF-8F27-9C2605A29F52');
          this.setProps({
            format: Formats.UINT32,
            unit: Units.SECONDS,
            perms: [
              Perms.READ,
              Perms.NOTIFY,
            ],
          });
        }
      }

      class DurationCharacteristic extends Characteristic {
        constructor() {
          super('Duration', 'E863F12D-079E-48FF-8F27-9C2605A29F52');
          this.setProps({
            format: Formats.UINT16,
            unit: Units.SECONDS,
            minValue: 5,
            maxValue: 15 * 3600,
            validValues: [
              5, 10, 20, 30,
              1 * 60, 2 * 60, 3 * 60, 5 * 60, 10 * 60, 20 * 60, 30 * 60,
              1 * 3600, 2 * 3600, 3 * 3600, 5 * 3600, 10 * 3600, 12 * 3600, 15 * 3600,
            ],
            perms: [
              Perms.READ,
              Perms.NOTIFY,
              Perms.WRITE,
            ],
          });
        }
      }

      class SensitivityCharacteristic extends Characteristic {
        constructor() {
          super('Sensitivity', 'E863F120-079E-48FF-8F27-9C2605A29F52');
          this.setProps({
            format: Formats.UINT8,
            minValue: 0,
            maxValue: 7,
            validValues: [0, 4, 7],
            perms: [
              Perms.READ,
              Perms.NOTIFY,
              Perms.WRITE,
            ],
          });
        }
      }

      this.service.addCharacteristic(LastActivationCharacteristic);
      this.service
        .getCharacteristic(LastActivationCharacteristic)
        .on('get', this.getLastActivation.bind(this));

      this.service.addCharacteristic(SensitivityCharacteristic);
      this.service
        .getCharacteristic(SensitivityCharacteristic)
        .on('get', (callback) => {
          callback(null, 4);
        });

      this.service.addCharacteristic(DurationCharacteristic);
      this.service
        .getCharacteristic(DurationCharacteristic)
        .on('get', (callback) => {
          callback(null, 5);
        });

      this.accessoryService = new Service.AccessoryInformation();
      this.accessoryService
        .setCharacteristic(Characteristic.Name, this.name)
        .setCharacteristic(Characteristic.SerialNumber, `hps-${this.name.toLowerCase()}`)
        .setCharacteristic(Characteristic.Manufacturer, 'Elgato');

      this.historyService = new FakeGatoHistoryService('motion', {
        displayName: this.name,
        log: this.log,
      },
      {
        storage: 'fs',
        disableTimer: true,
      });
    } else {
      this.accessoryService = new Service.AccessoryInformation();
      this.accessoryService
        .setCharacteristic(Characteristic.Name, this.name);

      if (this.type === 'occupancy') {
        this.service = new Service.OccupancySensor(this.name);
        this.service
          .getCharacteristic(Characteristic.OccupancyDetected)
          .on('get', this.getState.bind(this));
      }
    }

    this.initStateCache();

    if (this.pingInterval > -1) {
      this.pingFunction();
    }
  }

  /**
   * Encodes a given bool state
   * @param {bool} state The state as a bool
   * @returns {object} The state as a Characteristic or int
   */
  encodeState(state) {
    if (this.type === 'motion') {
      if (state) return 1;
      return 0;
    }
    if (this.type === 'occupancy') {
      if (state) return Characteristic.OccupancyDetected.OCCUPANCY_DETECTED;
      return Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
    }
    return null;
  }

  /**
   * Gets the current state from the cache
   * @param {function} callback The function to callback with the current state
   */
  getState(callback) {
    callback(null, this.encodeState(this.stateCache));
  }

  /**
   * Gets the date of the last activation / successful ping of this sensor
   * @param {function} callback The function to callback with the last activation time
   */
  getLastActivation(callback) {
    const lastSeenUnix = this.platform.storage.getItemSync(`lastSuccessfulPing_${this.target}`);
    if (lastSeenUnix) {
      const lastSeenSeconds = Math.floor(lastSeenUnix / 1000);
      callback(null, lastSeenSeconds - this.historyService.getInitialTime());
    } else {
      callback(null, 0);
    }
  }

  /**
   * Identifies / logs the name of this accessory
   * @param {function} callback Fnction to callback once finished
   */
  identify(callback) {
    this.log(`Identify: ${this.name}`);
    callback();
  }

  /**
   * Initiates the state cache with the current state
   */
  initStateCache() {
    const isActive = this.isActive();
    this.stateCache = isActive;
  }

  /**
   * Checks if the target of this accessory/sensor is currently active based on last successful ping
   * and configured threshold
   * @returns {bool} True if the target is currently active, false if not
  */
  isActive() {
    const lastSeenUnix = this.platform.storage.getItemSync(`lastSuccessfulPing_${this.target}`);
    if (lastSeenUnix) {
      const activeThreshold = Date.now() - (this.threshold * 60 * 1000);
      return lastSeenUnix > activeThreshold;
    }
    return false;
  }

  /**
   * Resolves a hostname against this sensor's configured custom DNS server(s), without touching
   * the process-wide default resolver (which dns.setServers() would do, affecting every other
   * sensor / plugin running in the same Homebridge process).
   * @param {string} hostname The hostname to resolve
   * @returns {Promise<string>} The first resolved IPv4 address
   */
  resolveWithCustomDns(hostname) {
    return new Promise((resolve, reject) => {
      const resolver = new Resolver();
      resolver.setServers(this.customDns);
      resolver.resolve4(hostname, (err, addresses) => {
        if (err) {
          reject(err);
          return;
        }
        if (!addresses || addresses.length === 0) {
          reject(new Error(`No A records found for ${hostname}`));
          return;
        }
        resolve(addresses[0]);
      });
    });
  }

  /**
   * Looks up a MAC address via ARP to determine if it currently responds.
   * @param {string} target The IP address or hostname to look up
   * @returns {Promise<bool>} True if a valid MAC address was found, false if not
   */
  checkArp(target) {
    return new Promise((resolve) => {
      arp.getMAC(target, (err, mac) => {
        resolve(!err && MAC_REGEX.test(mac));
      });
    });
  }

  /**
   * Pings a target via ICMP.
   * @param {string} target The IP address or hostname to ping
   * @returns {Promise<bool>} True if the target responded, false if not
   */
  checkPing(target) {
    return new Promise((resolve) => {
      ping.sys.probe(target, (state) => {
        resolve(state);
      });
    });
  }

  /**
   * Pings or, if configured, ARP lookups the target of this accessory/sensor and updated the state
   * accordingly. Gets called on a regular basis through an interval at the configured interval
   * time. If configured, looks up the given target hostname on a custom DNS server first.
   *
   * Regardless of how this run finishes (success, expected early exit, or unexpected error), the
   * `finally` block always schedules the next run - a sensor must never permanently stop polling
   * just because one cycle failed to resolve a MAC address or a DNS lookup.
   */
  async pingFunction() {
    try {
      if (this.webhookIsOutdated()) {
        let currentTarget = false;
        if (MAC_REGEX.test(this.target)) {
          // Target is MAC address - get IP first from arp
          const devices = await find();
          for (const device of devices) {
            if (device.mac.toLowerCase() === this.target.toLowerCase()) {
              currentTarget = device.ip;
              break;
            }
          }
        } else currentTarget = this.target;

        if (currentTarget === false) {
          this.log(`Could not resolve MAC address ${this.target} to an IP on the network; will retry next cycle.`);
          return;
        }

        if (this.customDns !== false) {
          try {
            currentTarget = await this.resolveWithCustomDns(currentTarget);
          } catch (e) {
            this.log(`Error during DNS resolve using custom DNS server: ${e.message}`);
            return;
          }
        }

        const state = this.pingUseArp
          ? await this.checkArp(currentTarget)
          : await this.checkPing(currentTarget);

        if (this.webhookIsOutdated()) {
          if (state) {
            this.platform.storage.setItemSync(`lastSuccessfulPing_${this.target}`, Date.now());
          }
          if (this.successfulPingOccurredAfterWebhook()) {
            const newState = this.isActive();
            this.setNewState(newState);
          }
        }
      }
    } catch (e) {
      this.log(`Unexpected error while checking status for ${this.target}: ${e.message}`);
    } finally {
      setTimeout(this.pingFunction.bind(this), this.pingInterval);
    }
  }

  /**
   * Checks if the last received webhook is outdated based on the configured threshold
   * @returns {bool} True if the webhook is outdated, false if it is not
   */
  webhookIsOutdated() {
    const lastWebhookUnix = this.platform.storage.getItemSync(`lastWebhook_${this.target}`);
    if (lastWebhookUnix) {
      const activeThreshold = Date.now() - (this.threshold * 60 * 1000);
      return lastWebhookUnix < activeThreshold;
    }
    return true;
  }

  /**
   * Checks if the last successful ping occured after the last webhook
   * @returns {bool} True if the last successful ping occured after the last webhook, false if
   * it did not
   */
  successfulPingOccurredAfterWebhook() {
    const lastSuccessfulPing = this.platform.storage.getItemSync(`lastSuccessfulPing_${this.target}`);
    if (!lastSuccessfulPing) {
      return false;
    }
    const lastWebhook = this.platform.storage.getItemSync(`lastWebhook_${this.target}`);
    if (!lastWebhook) {
      return true;
    }
    return lastSuccessfulPing > lastWebhook;
  }

  /**
   * Updates the state of the sensor and adds to the fakegato history
   * @param {bool} newState The new state as a bool
   */
  setNewState(newState) {
    const oldState = this.stateCache;
    if (oldState !== newState) {
      this.stateCache = newState;
      if (this.type === 'motion') {
        this.service.getCharacteristic(Characteristic.MotionDetected)
          .updateValue(this.encodeState(newState));
      } else {
        this.service.getCharacteristic(Characteristic.OccupancyDetected)
          .updateValue(this.encodeState(newState));
      }

      if (this.platform.peopleAnyOneAccessory) {
        this.platform.peopleAnyOneAccessory.refreshState();
      }

      if (this.platform.peopleNoOneAccessory) {
        this.platform.peopleNoOneAccessory.refreshState();
      }

      let lastSuccessfulPingFormatted = 'none';
      let lastWebhookFormatted = 'none';
      const lastSuccessfulPing = this.platform.storage.getItemSync(`lastSuccessfulPing_${this.target}`);
      if (lastSuccessfulPing) {
        lastSuccessfulPingFormatted = new Date(lastSuccessfulPing).toISOString();
      }
      const lastWebhook = this.platform.storage.getItemSync(`lastWebhook_${this.target}`);
      if (lastWebhook) {
        lastWebhookFormatted = new Date(lastWebhook).toISOString();
      }

      if (this.type === 'motion') {
        this.historyService.addEntry({
          time: Math.floor(Date.now() / 1000),
          status: (newState) ? 1 : 0,
        });
      }
      if (this.pingUseArp) {
        this.log('Changed occupancy state for %s to %s. Last successful arp lookup %s , last webhook %s .', this.target, newState, lastSuccessfulPingFormatted, lastWebhookFormatted);
      } else {
        this.log('Changed occupancy state for %s to %s. Last successful ping %s , last webhook %s .', this.target, newState, lastSuccessfulPingFormatted, lastWebhookFormatted);
      }
    }
  }

  getServices() {
    const servicesList = [this.service];

    if (this.historyService) {
      servicesList.push(this.historyService);
    }
    if (this.accessoryService) {
      servicesList.push(this.accessoryService);
    }

    return servicesList;
  }
}

module.exports = PeopleProAccessory;
