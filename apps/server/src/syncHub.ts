type Waiter = {
  resolve: () => void;
};

const waiters = new Map<string, Set<Waiter>>();

export function notifySync(userIds: string[]): void {
  const seen = new Set(userIds);
  for (const userId of seen) {
    const set = waiters.get(userId);
    if (!set) {
      continue;
    }
    for (const waiter of set) {
      waiter.resolve();
    }
    set.clear();
  }
}

export function waitForSync(userId: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const waiter: Waiter = { resolve };
    let set = waiters.get(userId);
    if (!set) {
      set = new Set();
      waiters.set(userId, set);
    }
    set.add(waiter);
    setTimeout(() => {
      set.delete(waiter);
      resolve();
    }, ms);
  });
}
