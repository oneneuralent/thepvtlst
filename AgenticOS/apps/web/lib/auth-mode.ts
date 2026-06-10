export function isDevAuthMode() {
  return (process.env.AUTH_MODE ?? "dev") === "dev";
}

export function isClerkAuthMode() {
  return process.env.AUTH_MODE === "clerk";
}
