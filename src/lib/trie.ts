/**
 * Trie Node for fast prefix-based searching
 */
export class TrieNode {
  children: Map<string, TrieNode>;
  itemIds: Set<string>;

  constructor() {
    this.children = new Map();
    this.itemIds = new Set();
  }
}

/**
 * Trie (Prefix Tree) Data Structure
 * Optimized for searching items by name and description in O(L) time.
 */
export class SearchTrie {
  root: TrieNode;

  constructor() {
    this.root = new TrieNode();
  }

  /**
   * Inserts a text string (e.g. name or description) into the Trie.
   * It tokenizes the string and inserts every word.
   */
  insert(text: string, itemId: string) {
    if (!text) return;
    const words = text.toLowerCase().split(/[\s\W]+/);
    for (const word of words) {
      if (!word) continue;
      this.insertWord(word, itemId);
    }
  }

  private insertWord(word: string, itemId: string) {
    let current = this.root;
    for (const char of word) {
      if (!current.children.has(char)) {
        current.children.set(char, new TrieNode());
      }
      current = current.children.get(char)!;
      // Store the item ID at every node along the path
      // This allows prefix matches (e.g. "Pan" matches "Paneer")
      current.itemIds.add(itemId);
    }
  }

  /**
   * Searches for a query string.
   * If the query has multiple words, it returns the intersection of matches.
   * Returns null if query is empty, or a Set of matching item IDs.
   */
  search(query: string): Set<string> | null {
    if (!query || query.trim() === '') return null;
    
    const words = query.toLowerCase().split(/[\s\W]+/);
    let resultItemIds: Set<string> | null = null;

    for (const word of words) {
      if (!word) continue;
      
      let current = this.root;
      let found = true;
      for (const char of word) {
        if (!current.children.has(char)) {
          found = false;
          break;
        }
        current = current.children.get(char)!;
      }

      if (!found) {
        return new Set(); // One of the words didn't match anything
      }

      if (resultItemIds === null) {
        resultItemIds = new Set(current.itemIds);
      } else {
        // Intersection of results
        const intersected = new Set<string>();
        for (const id of current.itemIds) {
          if (resultItemIds.has(id)) {
            intersected.add(id);
          }
        }
        resultItemIds = intersected;
      }
    }

    return resultItemIds;
  }
}
