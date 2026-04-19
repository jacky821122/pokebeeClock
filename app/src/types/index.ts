export interface Employee {
  name: string;
  role: "full_time" | "hourly";
  active: boolean;
}

export type PunchKind = "in" | "out";

export interface Punch {
  id: string;
  employee: string;
  client_ts: string; // ISO string, Asia/Taipei
  server_ts: string;
  source: "pwa" | "ichef-import";
  kind: PunchKind;
}
