/** In-memory tables for tests. */
import type { AddressRow, ChangeRow, ResultRow, SubscriptionRow, Tables } from "./service";

export function memoryTables() {
  const addresses: AddressRow[] = [];
  const results = new Map<string, ResultRow>();
  const subscriptions: SubscriptionRow[] = [];
  const changes: ChangeRow[] = [];
  const waitlist = new Map<string, { count: number; first_at: string; last_at: string }>();
  const tables: Tables = {
    addChanges: (rows) => void changes.push(...rows),
    recentChanges: (uprn) => changes.filter((c) => c.uprn === uprn),
    addresses: () => addresses.map((a) => ({ ...a })),
    addAddress: (row) => void addresses.push({ ...row }),
    getResult: (uprn) => results.get(uprn) ?? null,
    putResult: (row) => void results.set(row.uprn, JSON.parse(JSON.stringify(row)) as ResultRow),
    countSubscriptions: (uprn) => subscriptions.filter((s) => uprn === undefined || s.uprn === uprn).length,
    addSubscription: (row) => void subscriptions.push({ ...row }),
    findSubscription: (token) => subscriptions.find((s) => s.token === token) ?? null,
    subscriptions: () => subscriptions.map((s) => ({ ...s })),
    touchSubscription: (token, today) => {
      const row = subscriptions.find((s) => s.token === token);
      if (row) row.last_used = today;
    },
    hasAddress: (uprn) => addresses.some((a) => a.uprn === uprn),
    deleteSubscription: (token) => {
      const index = subscriptions.findIndex((s) => s.token === token);
      return index === -1 ? null : (subscriptions.splice(index, 1)[0] as SubscriptionRow);
    },
    deleteAddress: (uprn) => {
      for (const list of [addresses, changes] as { uprn: string }[][]) {
        for (let i = list.length - 1; i >= 0; i--) if (list[i].uprn === uprn) list.splice(i, 1);
      }
      results.delete(uprn);
    },
    bumpWaitlist: (onsCode, at, maxCouncils) => {
      const row = waitlist.get(onsCode);
      if (row) {
        row.count += 1;
        row.last_at = at;
      } else if (waitlist.size < maxCouncils) {
        waitlist.set(onsCode, { count: 1, first_at: at, last_at: at });
      }
    },
  };
  return { tables, addresses, results, subscriptions, changes, waitlist };
}
