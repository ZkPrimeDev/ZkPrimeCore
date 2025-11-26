import { ZkPrimeConfig, WalletAdapter } from './types';
import { mergeConfig } from './config';
import { PrivateStateClient } from './privateState/privateStateClient';
import { ConfidentialComputeClient } from './confidentialCompute/confidentialComputeClient';

/**
 * High-level client entrypoint exported as `ZkPrimeClient`.
 * The constructor accepts either a config object or a connection URL + optional wallet adapter.
 */
export class ZkPrimeClient {
  public config: ZkPrimeConfig;
  public privateState: PrivateStateClient;
  public confidentialCompute: ConfidentialComputeClient;

  constructor(opts: Partial<ZkPrimeConfig> & { walletAdapter?: WalletAdapter } = {}) {
    this.config = mergeConfig(opts);
    // propagate walletAdapter into components as needed via runtime params
    this.privateState = new PrivateStateClient(this.config);
    this.confidentialCompute = new ConfidentialComputeClient(this.config);
  }
}
