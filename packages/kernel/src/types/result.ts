export type Result<T, E> = Ok<T> | Err<E>;
export type Ok<T> = Readonly<{ ok: true; value: T }>;
export type Err<E> = Readonly<{ ok: false; error: E }>;

export const Ok = <T>(value: T): Ok<T> => Object.freeze({ ok: true, value });
export const Err = <E>(error: E): Err<E> => Object.freeze({ ok: false, error });

export const map = <T, E, U>(r: Result<T, E>, f: (t: T) => U): Result<U, E> =>
  r.ok ? Ok(f(r.value)) : r;

export const flatMap = <T, E, U, E2>(
  r: Result<T, E>,
  f: (t: T) => Result<U, E2>
): Result<U, E | E2> => (r.ok ? f(r.value) : r);
