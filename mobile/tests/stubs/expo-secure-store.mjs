const store = new Map();
export const __store = store;
export const getItemAsync = async (k) => (store.has(k) ? store.get(k) : null);
export const setItemAsync = async (k, v) => { store.set(k, v); };
export const deleteItemAsync = async (k) => { store.delete(k); };
