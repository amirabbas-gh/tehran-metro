/** Subset of GoatCounter's `window.goatcounter` used by this app. */
export type GoatCounterHit = {
  path?: string | ((current: string) => string | null);
  title?: string | ((current: string) => string);
  referrer?: string;
  event?: boolean;
};

export type GoatCounter = GoatCounterHit & {
  no_onload?: boolean;
  no_events?: boolean;
  allow_local?: boolean;
  allow_frame?: boolean;
  endpoint?: string;
  count?: (vars?: GoatCounterHit) => void;
  url?: (vars?: GoatCounterHit) => string | undefined;
  filter?: () => string | false;
};

declare global {
  interface Window {
    goatcounter?: GoatCounter;
  }
}

export {};
