export interface Employee {
  name: string;
  role: "full_time" | "hourly";
  active: boolean;
}

export interface Punch {
  id: string;
  employee: string;
  client_ts: string; // ISO string, Asia/Taipei
  server_ts: string;
  source: "pwa";
}
