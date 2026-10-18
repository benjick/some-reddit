export interface CheckRequest {
  type: 'check';
  url: string;
  referrer: string | null;
}

export interface CheckResponse {
  allowed: boolean;
}
