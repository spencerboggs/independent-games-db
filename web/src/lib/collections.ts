export function sortBy<T>(
  items: T[],
  value: (item: T) => string | number | null | undefined,
  direction: "asc" | "desc" = "asc",
): T[] {
  const sign = direction === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    const left = value(a);
    const right = value(b);

    if (left === right) return 0;
    if (left === null || left === undefined || left === "") return 1;
    if (right === null || right === undefined || right === "") return -1;

    if (typeof left === "number" && typeof right === "number") {
      return (left - right) * sign;
    }

    return String(left).localeCompare(String(right), "en", { numeric: true }) * sign;
  });
}


export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const value = key(item);
    const group = groups.get(value);
    if (group) group.push(item);
    else groups.set(value, [item]);
  }

  return groups;
}
