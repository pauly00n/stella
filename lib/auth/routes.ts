export const AUTH_ROUTES = {
  home: "/",
  login: "/login",
  signUp: "/sign-up",
  forgotPassword: "/forgot-password",
  updatePassword: "/update-password",
  error: "/error",
} as const;

export function sanitizeNextPath(nextPath: string | null | undefined): string {
  if (!nextPath) return AUTH_ROUTES.home;
  if (!nextPath.startsWith("/")) return AUTH_ROUTES.home;
  if (nextPath.startsWith("//")) return AUTH_ROUTES.home;
  return nextPath;
}
