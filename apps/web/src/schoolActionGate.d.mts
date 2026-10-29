export type PreviewTicket = { session: number; request: number };
export type SchoolActionGate = {
  beginPreview: () => PreviewTicket | null;
  isCurrentPreview: (ticket: PreviewTicket) => boolean;
  beginExecution: () => number | null;
  isCurrentSession: (ticket: number) => boolean;
  endExecution: (ticket: number) => void;
  resetSession: () => void;
};
export declare function createSchoolActionGate(): SchoolActionGate;
