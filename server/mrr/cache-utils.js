// ==========================
//  LIB: CACHE UTILITIES
//  Generic caching with TTL
// ==========================

export class Cache {
  constructor(ttl = 60000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return undefined;
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    return item.value;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  has(key) {
    return this.cache.has(key);
  }

  getOrSet(key, factory) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    
    const value = factory();
    this.set(key, value);
    return value;
  }
}

export class TTLMap extends Map {
  constructor(ttl = 60000) {
    super();
    this.ttl = ttl;
    this.timestamps = new Map();
  }

  set(key, value) {
    super.set(key, value);
    this.timestamps.set(key, Date.now());
    return this;
  }

  get(key) {
    const timestamp = this.timestamps.get(key);
    if (!timestamp) return undefined;
    if (Date.now() - timestamp > this.ttl) {
      this.delete(key);
      return undefined;
    }
    return super.get(key);
  }

  delete(key) {
    this.timestamps.delete(key);
    return super.delete(key);
  }

  clear() {
    this.timestamps.clear();
    return super.clear();
  }
}