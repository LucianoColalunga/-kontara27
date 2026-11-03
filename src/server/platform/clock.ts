import "server-only";

/** Reloj inyectable: los servicios no llaman a `new Date()` directamente, así las pruebas controlan el tiempo. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(start: Date): Clock & { advance(ms: number): void; set(at: Date): void } {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (ms) => {
      current += ms;
    },
    set: (at) => {
      current = at.getTime();
    },
  };
}
