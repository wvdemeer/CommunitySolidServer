import fetch from 'cross-fetch';
import { NotImplementedHttpError } from '../../util/errors/NotImplementedHttpError';
import type { KeyValueStorage } from './KeyValueStorage';

// Having this be a KeyValueStorage is sort of overkill since most of the functions are not needed
// But I was lazy and didn't want to bother writing a new interface and finding a logical place for it right now

// Might make more sense to have the key be a URL
export class CachedWebStorage implements KeyValueStorage<string, string> {
  // There should be a constructor here taking another storage as input
  // That other storage can then be used as cache

  public async get(key: string): Promise<string | undefined> {
    // Should check cache first
    return (await fetch(key)).text();
  }

  public async has(key: string): Promise<boolean> {
    throw new NotImplementedHttpError();
  }

  public async set(key: string, value: string): Promise<this> {
    throw new NotImplementedHttpError();
  }

  public async delete(key: string): Promise<boolean> {
    throw new NotImplementedHttpError();
  }

  public entries(): AsyncIterableIterator<[string, string]> {
    throw new NotImplementedHttpError();
  }
}
