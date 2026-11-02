import { expect, it } from 'vitest';
import {
  isPrivateAddress,
  selectMobileAddress,
} from '../scripts/mobile-network.cjs';

const nic = (address: string) => ({ address, family: 'IPv4', internal: false });
it('selects Wi-Fi instead of Docker and WSL virtual adapters', () => {
  expect(
    selectMobileAddress({
      'Wi-Fi': [nic('192.168.1.125')],
      'vEthernet (WSL)': [nic('172.17.64.1')],
      'vEthernet (Default Switch)': [nic('172.30.240.1')],
    }),
  ).toBe('192.168.1.125');
});
it.each([
  '0.0.0.0',
  '127.0.0.1',
  '8.8.8.8',
  '192.168.1.999',
  '::1',
  '192.168.1.1:4000',
  '192.168.1.1\n',
])('rejects unsafe or malformed bind address %s', (address) => {
  expect(isPrivateAddress(address)).toBe(false);
});
it('requires an explicit address to belong to the computer', () => {
  expect(() =>
    selectMobileAddress({ 'Wi-Fi': [nic('192.168.1.125')] }, '192.168.1.22'),
  ).toThrow();
});
it('accepts an explicit private interface and refuses ambiguous automatic selection', () => {
  const interfaces = {
    Ethernet: [nic('10.1.0.2')],
    'Ethernet 2': [nic('192.168.1.3')],
  };
  expect(selectMobileAddress(interfaces, '10.1.0.2')).toBe('10.1.0.2');
  expect(() => selectMobileAddress(interfaces)).toThrow();
});
it('does not fall back to a virtual adapter when Wi-Fi is disconnected', () => {
  expect(() =>
    selectMobileAddress({ 'vEthernet (WSL)': [nic('172.17.64.1')] }),
  ).toThrow();
});
