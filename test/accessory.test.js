/**
 * Tests for the pure(ish) logic in PeopleProAccessory: state encoding and the date/threshold
 * math that decides whether a sensor is "active". These functions only touch `this.type`,
 * `this.target`, `this.threshold` and `this.platform.storage` - none of them need a real
 * Homebridge/HAP instance - so we build bare instances with `Object.create` instead of going
 * through the constructor (which does need HAP globals to set up Services/Characteristics).
 */

// accessory.js expects `Characteristic` to exist as a global (set by index.js in production).
// For encodeState()'s 'occupancy' branch we only need the two constants it reads.
global.Characteristic = {
  OccupancyDetected: {
    OCCUPANCY_DETECTED: 1,
    OCCUPANCY_NOT_DETECTED: 0,
  },
};

const PeopleProAccessory = require('../src/accessory');

/**
 * Builds a bare PeopleProAccessory instance (bypassing the constructor) with the given
 * properties, plus a fake `platform.storage` backed by a plain object.
 * @param {object} props Properties to assign directly on the instance (type, target, threshold)
 * @param {object} storageData Initial key/value data for the fake storage
 * @returns {object} A PeopleProAccessory-shaped instance
 */
function makeAccessory(props, storageData = {}) {
  const accessory = Object.create(PeopleProAccessory.prototype);
  Object.assign(accessory, props);
  accessory.platform = {
    storage: {
      getItemSync: (key) => storageData[key],
    },
  };
  return accessory;
}

describe('encodeState', () => {
  test('motion sensor: truthy state encodes to 1', () => {
    const accessory = makeAccessory({ type: 'motion' });
    expect(accessory.encodeState(true)).toBe(1);
  });

  test('motion sensor: falsy state encodes to 0', () => {
    const accessory = makeAccessory({ type: 'motion' });
    expect(accessory.encodeState(false)).toBe(0);
  });

  test('occupancy sensor: truthy state encodes to OCCUPANCY_DETECTED', () => {
    const accessory = makeAccessory({ type: 'occupancy' });
    expect(accessory.encodeState(true)).toBe(Characteristic.OccupancyDetected.OCCUPANCY_DETECTED);
  });

  test('occupancy sensor: falsy state encodes to OCCUPANCY_NOT_DETECTED', () => {
    const accessory = makeAccessory({ type: 'occupancy' });
    expect(accessory.encodeState(false))
      .toBe(Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);
  });

  test('unknown type encodes to null', () => {
    const accessory = makeAccessory({ type: 'something-else' });
    expect(accessory.encodeState(true)).toBeNull();
  });
});

describe('isActive', () => {
  const target = '192.168.1.50';

  test('no ping data at all: not active', () => {
    const accessory = makeAccessory({ target, threshold: 15 });
    expect(accessory.isActive()).toBe(false);
  });

  test('recent successful ping within threshold: active', () => {
    const accessory = makeAccessory({ target, threshold: 15 }, {
      [`lastSuccessfulPing_${target}`]: Date.now() - (5 * 60 * 1000), // 5 min ago
    });
    expect(accessory.isActive()).toBe(true);
  });

  test('successful ping older than threshold: not active', () => {
    const accessory = makeAccessory({ target, threshold: 15 }, {
      [`lastSuccessfulPing_${target}`]: Date.now() - (30 * 60 * 1000), // 30 min ago
    });
    expect(accessory.isActive()).toBe(false);
  });
});

describe('webhookIsOutdated', () => {
  const target = '192.168.1.50';

  test('no webhook data at all: outdated (true)', () => {
    const accessory = makeAccessory({ target, threshold: 15 });
    expect(accessory.webhookIsOutdated()).toBe(true);
  });

  test('recent webhook within threshold: not outdated', () => {
    const accessory = makeAccessory({ target, threshold: 15 }, {
      [`lastWebhook_${target}`]: Date.now() - (5 * 60 * 1000),
    });
    expect(accessory.webhookIsOutdated()).toBe(false);
  });

  test('webhook older than threshold: outdated', () => {
    const accessory = makeAccessory({ target, threshold: 15 }, {
      [`lastWebhook_${target}`]: Date.now() - (30 * 60 * 1000),
    });
    expect(accessory.webhookIsOutdated()).toBe(true);
  });
});

describe('successfulPingOccurredAfterWebhook', () => {
  const target = '192.168.1.50';

  test('no successful ping at all: false', () => {
    const accessory = makeAccessory({ target, threshold: 15 });
    expect(accessory.successfulPingOccurredAfterWebhook()).toBe(false);
  });

  test('successful ping but no webhook yet: true', () => {
    const accessory = makeAccessory({ target, threshold: 15 }, {
      [`lastSuccessfulPing_${target}`]: Date.now(),
    });
    expect(accessory.successfulPingOccurredAfterWebhook()).toBe(true);
  });

  test('ping after webhook: true', () => {
    const now = Date.now();
    const accessory = makeAccessory({ target, threshold: 15 }, {
      [`lastWebhook_${target}`]: now - 10000,
      [`lastSuccessfulPing_${target}`]: now,
    });
    expect(accessory.successfulPingOccurredAfterWebhook()).toBe(true);
  });

  test('ping before webhook: false', () => {
    const now = Date.now();
    const accessory = makeAccessory({ target, threshold: 15 }, {
      [`lastSuccessfulPing_${target}`]: now - 10000,
      [`lastWebhook_${target}`]: now,
    });
    expect(accessory.successfulPingOccurredAfterWebhook()).toBe(false);
  });
});
