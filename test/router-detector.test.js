/**
 * Tests for RouterDetector's client-list parsing logic (see src/router-detector.js). The actual
 * SSH connection can't be tested without a real router, so these focus on what we can verify
 * deterministically: turning the router's JSON output into a list of MAC addresses, and
 * normalizing the watched target list. The parser is deliberately structure-agnostic (it scans
 * for anything that looks like a MAC address, rather than assuming one fixed JSON shape) since
 * the real /tmp/clientlist.json format varies across Asuswrt/Asuswrt-Merlin firmware versions -
 * these tests cover a few plausible shapes, not a confirmed-correct one.
 */
const RouterDetector = require('../src/router-detector');

function makeDetector() {
  const logs = [];
  const log = (...args) => logs.push(args.join(' '));
  const detector = new RouterDetector(log, {
    host: '192.168.1.1',
    username: 'admin',
    password: 'irrelevant-for-these-tests',
  }, { setItemSync: () => {} });
  return { detector, logs };
}

// Real /tmp/clientlist.json structure from an Asus RT-AC68U (Asuswrt), verified against actual
// router output: an outer object keyed by the ROUTER's own MAC address, wrapping three
// categories ("2G", "5G", "wired_mac") of connected clients, each keyed by client MAC with an
// "ip" (and, for Wi-Fi clients, "rssi") field. MAC addresses below are fictional.
const REAL_ROUTER_SAMPLE = JSON.stringify({
  '70:8B:CD:30:A9:E0': {
    '2G': {
      '04:17:B6:41:18:4E': { ip: '192.168.2.202', rssi: '-43' },
      '34:3E:A4:B1:A7:3E': { ip: '192.168.2.208', rssi: '-38' },
    },
    '5G': {
      '90:CD:E8:07:B7:31': { ip: '192.168.2.64', rssi: '-71' },
      '7E:DF:5E:1C:5C:09': { ip: '192.168.2.136', rssi: '-61' },
    },
    wired_mac: {
      'EC:B5:FA:8A:F6:E9': { ip: '192.168.2.58' },
      'B8:27:EB:12:A8:BC': { ip: '192.168.2.49' },
    },
  },
});

describe('parseClientList', () => {
  test('real Asuswrt structure: extracts every client MAC across 2G/5G/wired, excludes the router\'s own MAC', () => {
    const { detector } = makeDetector();
    const macs = detector.parseClientList(REAL_ROUTER_SAMPLE);
    expect(macs.sort()).toEqual([
      '04:17:b6:41:18:4e',
      '34:3e:a4:b1:a7:3e',
      '7e:df:5e:1c:5c:09',
      '90:cd:e8:07:b7:31',
      'b8:27:eb:12:a8:bc',
      'ec:b5:fa:8a:f6:e9',
    ].sort());
    // The router's own MAC (the outer wrapping key) must NOT be reported as a connected client.
    expect(macs).not.toContain('70:8b:cd:30:a9:e0');
  });

  test('a MAC-shaped key without an "ip" field is not treated as a client (e.g. a wrapper/grouping key)', () => {
    const { detector } = makeDetector();
    const raw = JSON.stringify({
      '70:8B:CD:30:A9:E0': {
        wired_mac: {
          'AA:BB:CC:DD:EE:FF': { ip: '192.168.2.10' },
        },
      },
    });
    const macs = detector.parseClientList(raw);
    expect(macs).toEqual(['aa:bb:cc:dd:ee:ff']);
  });

  test('deduplicates the same MAC appearing in multiple categories', () => {
    const { detector } = makeDetector();
    const raw = JSON.stringify({
      router: {
        '2G': { 'AA:BB:CC:DD:EE:FF': { ip: '192.168.2.10' } },
        wired_mac: {
          'AA:BB:CC:DD:EE:FF': { ip: '192.168.2.10' },
          '11:22:33:44:55:66': { ip: '192.168.2.11' },
        },
      },
    });
    const macs = detector.parseClientList(raw);
    expect(macs.sort()).toEqual(['11:22:33:44:55:66', 'aa:bb:cc:dd:ee:ff']);
  });

  test('valid JSON with no client MACs at all: returns empty array, logs a warning', () => {
    const { detector, logs } = makeDetector();
    const macs = detector.parseClientList(JSON.stringify({ status: 'ok', count: 0 }));
    expect(macs).toEqual([]);
    expect(logs.some((entry) => entry.includes('found no MAC addresses'))).toBe(true);
  });

  test('invalid JSON throws a descriptive error instead of crashing the process', () => {
    const { detector } = makeDetector();
    expect(() => detector.parseClientList('{not valid json')).toThrow(/Could not parse/);
  });

  test('empty string throws a descriptive error', () => {
    const { detector } = makeDetector();
    expect(() => detector.parseClientList('')).toThrow(/Could not parse/);
  });
});

describe('setTargets', () => {
  test('lowercases and stores the watched MAC addresses', () => {
    const { detector } = makeDetector();
    detector.setTargets(['AA:BB:CC:DD:EE:FF', '11:22:33:44:55:66']);
    expect(detector.macTargets).toEqual(['aa:bb:cc:dd:ee:ff', '11:22:33:44:55:66']);
  });
});

describe('start', () => {
  test('does nothing (and does not throw) if no MAC targets are configured', () => {
    const { detector, logs } = makeDetector();
    detector.setTargets([]);
    expect(() => detector.start()).not.toThrow();
    expect(logs.some((entry) => entry.includes('no sensor has a MAC address target'))).toBe(true);
  });
});
