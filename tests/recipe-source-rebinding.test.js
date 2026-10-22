import { describe, expect, it } from 'vitest';
import { guardedLookup } from '../src/server/recipe-source.js';

/**
 * The connect-time address check: whatever the earlier check saw, the socket
 * itself refuses to connect to a private address (DNS rebinding).
 */
const resolveTo = (addresses) => (hostname, options, callback) => callback(null, addresses);
const run = (addresses, options = {}) => new Promise((resolve) => {
  guardedLookup(resolveTo(addresses))('example.com', options, (error, address, family) => resolve({ error, address, family }));
});

describe('guardedLookup', () => {
  it('passes public addresses through, in either callback shape', async () => {
    expect(await run([{ address: '93.184.216.34', family: 4 }])).toMatchObject({ error: null, address: '93.184.216.34', family: 4 });
    const all = await run([{ address: '93.184.216.34', family: 4 }], { all: true });
    expect(all.address).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('refuses loopback, link-local metadata and private ranges at connect time', async () => {
    for (const address of ['127.0.0.1', '169.254.169.254', '10.0.0.5', '192.168.1.1', '::1']) {
      const { error } = await run([{ address, family: address.includes(':') ? 6 : 4 }]);
      expect(error?.message, address).toBe('blocked-address');
    }
  });

  it('refuses a host that answers with a mix of public and private', async () => {
    const { error } = await run([{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]);
    expect(error?.message).toBe('blocked-address');
  });
});
