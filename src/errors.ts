export class ZkPrimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZkPrimeError';
  }
}

export class ConfigError extends ZkPrimeError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class SchemaError extends ZkPrimeError {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

export class CryptoError extends ZkPrimeError {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

export class RPCError extends ZkPrimeError {
  constructor(message: string) {
    super(message);
    this.name = 'RPCError';
  }
}

export class NotFoundError extends ZkPrimeError {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
