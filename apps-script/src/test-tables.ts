/** In-memory tables for tests. */
import type { AddressRow, ChangeRow, ResultRow, SubscriptionRow, Tables } from "./service";

export function memoryTables() {
  const addresses: AddressRow[] = [];
  const results = new Map<string, ResultRow>();
  const subscriptions: SubscriptionRow[] = [];
  const changes: ChangeRow[] = [];
  const tables: Tables = {
    addChanges: (rows) => void changes.push(...rows),
    addresses: () => addresses.map((a) => ({ ...a })),
    addAddress: (row) => void addresses.push({ ...row }),
    getResult: (uprn) => results.get(uprn) ?? null,
    putResult: (row) => void results.set(row.uprn, JSON.parse(JSON.stringify(row)) as ResultRow),
    countSubscriptions: (uprn) => subscriptions.filter((s) => uprn === undefined || s.uprn === uprn).length,
    addSubscription: (row) => void subscriptions.push({ ...row }),
    findSubscription: (token) => subscriptions.find((s) => s.token === token) ?? null,
  };
  return { tables, addresses, results, subscriptions, changes };
}
