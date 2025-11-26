import { ZkPrimeConfig } from './types';

export const DEFAULTS: ZkPrimeConfig = {
  rpcEndpoint: 'https://api.mainnet-beta.solana.com'
};

export function mergeConfig(cfg: Partial<ZkPrimeConfig>): ZkPrimeConfig {
  return Object.assign({}, DEFAULTS, cfg);
}
