/**
 * Node for the Doubly Linked List used in LRU Cache
 */
class LRUNode<K, V> {
  key: K;
  value: V;
  prev: LRUNode<K, V> | null = null;
  next: LRUNode<K, V> | null = null;

  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
  }
}

/**
 * LRU (Least Recently Used) Cache Implementation
 * Provides O(1) time complexity for both get and put operations.
 * Automatically evicts the least recently used item when capacity is reached.
 */
export class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, LRUNode<K, V>>;
  private head: LRUNode<K, V> | null = null;
  private tail: LRUNode<K, V> | null = null;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  /**
   * Retrieves an item from the cache.
   * If the item exists, it is moved to the front (Most Recently Used).
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }

    const node = this.cache.get(key)!;
    this.moveToHead(node);
    return node.value;
  }

  /**
   * Puts an item into the cache.
   * If the cache reaches capacity, the least recently used item is evicted.
   */
  put(key: K, value: V): void {
    if (this.cache.has(key)) {
      const node = this.cache.get(key)!;
      node.value = value;
      this.moveToHead(node);
    } else {
      const newNode = new LRUNode(key, value);
      this.cache.set(key, newNode);
      this.addToHead(newNode);

      if (this.cache.size > this.capacity) {
        this.removeTail();
      }
    }
  }

  /**
   * Clears the entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  private moveToHead(node: LRUNode<K, V>) {
    if (this.head === node) return; // Already at head

    this.removeNode(node);
    this.addToHead(node);
  }

  private removeNode(node: LRUNode<K, V>) {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private addToHead(node: LRUNode<K, V>) {
    node.prev = null;
    node.next = this.head;
    
    if (this.head) {
      this.head.prev = node;
    }
    
    this.head = node;
    
    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeTail() {
    if (!this.tail) return;
    
    this.cache.delete(this.tail.key);
    this.removeNode(this.tail);
  }
}

// Create a global instance for caching restaurant details across the app
export const globalRestaurantCache = new LRUCache<string, string>(10);
