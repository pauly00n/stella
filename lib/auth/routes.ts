export const AUTH_ROUTES = {
  home: "/stella",
  login: "/stella/login",
  signUp: "/stella/sign-up",
  forgotPassword: "/stella/forgot-password",
  updatePassword: "/stella/update-password",
  error: "/stella/error",
} as const;

export function sanitizeNextPath(nextPath: string | null | undefined): string {
  if (!nextPath) return AUTH_ROUTES.home;
  if (!nextPath.startsWith("/")) return AUTH_ROUTES.home;
  if (nextPath.startsWith("//")) return AUTH_ROUTES.home;
  return nextPath;
}
