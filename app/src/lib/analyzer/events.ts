/**
 * Event types consumed by the analyzer. These map 1:1 onto the Python Event
 * dataclass: `kind` is one of the four strings below; `timestamp` is present
 * for every variant except `no-clock-out`.
 */
export type Event =
  | { kind: "clock-in"; timestamp: Date }
  | { kind: "clock-out"; timestamp: Date }
  | { kind: "clock-out-no-in"; timestamp: Date }
  | { kind: "no-clock-out" };
