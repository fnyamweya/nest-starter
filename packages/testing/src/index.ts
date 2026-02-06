export type TestClock = Readonly<{ now: () => string }>; 

export const fixedClock = (iso: string): TestClock => Object.freeze({
  now: () => iso
});
