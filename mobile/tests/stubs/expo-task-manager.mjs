// Bản giả expo-task-manager: lưu tác vụ để test gọi trực tiếp
export const __tasks = new Map();
export const defineTask = (name, fn) => { __tasks.set(name, fn); };
