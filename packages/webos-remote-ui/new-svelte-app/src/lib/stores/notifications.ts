import { writable } from 'svelte/store';

export type NotificationType = 'info' | 'success' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
}

function createNotificationStore() {
  const { subscribe, update } = writable<Notification[]>([]);

  return {
    subscribe,
    push(type: NotificationType, message: string) {
      const id = crypto.randomUUID();
      update((items) => [...items, { id, type, message }]);
      return id;
    },
    dismiss(id: string) {
      update((items) => items.filter((item) => item.id !== id));
    },
    clear() {
      update(() => []);
    }
  };
}

export const notificationStore = createNotificationStore();
