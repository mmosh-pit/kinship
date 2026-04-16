// All responses wrap payload in { data: {...} } to match the Go backend contract
// that the mmosh-app frontend already depends on.

export function ok<T>(payload: T) {
  return { data: payload };
}

export function err(message: string) {
  return { error: message };
}
