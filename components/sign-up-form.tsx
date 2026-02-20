"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AUTH_ROUTES } from "@/lib/auth/routes";

function getErrorCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; code?: unknown };
  if (typeof candidate.code === "string" || typeof candidate.code === "number") {
    return candidate.code;
  }
  if (typeof candidate.status === "string" || typeof candidate.status === "number") {
    return candidate.status;
  }
  return undefined;
}

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${AUTH_ROUTES.home}`,
        },
      });
      
      // Log response for debugging
      console.log('Sign up response:', { data, error });
      
      if (error) {
        // Log error for debugging
        console.log('Sign up error:', error);
        
        // Check if the error is about user already existing
        const errorMessage = (error.message || '').toLowerCase();
        const errorCode = getErrorCode(error) ?? '';
        
        // Check various possible error messages and status codes
        if (errorMessage.includes('already registered') || 
            errorMessage.includes('already exists') ||
            errorMessage.includes('user already registered') ||
            errorMessage.includes('email address is already registered') ||
            errorMessage.includes('email already registered') ||
            errorMessage.includes('user with this email address has already been registered') ||
            errorCode === 422 ||
            errorCode === '422') {
          router.push("/stella/sign-up-exists");
          return;
        }
        throw error;
      }
      
      // If no error but also no user created, might indicate existing user
      // (Supabase might silently fail without error if email exists)
      if (!data.user) {
        // Try to check if we can sign in (which would confirm email exists)
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: password + '_wrong', // Deliberately wrong password
        });
        
        // If we get a password error (not "email not found"), email exists
        if (signInError && (
          signInError.message?.toLowerCase().includes('invalid login') ||
          signInError.message?.toLowerCase().includes('incorrect password') ||
          signInError.message?.toLowerCase().includes('email not confirmed')
        )) {
          router.push("/stella/sign-up-exists");
          return;
        }
      }
      
      router.push("/stella/sign-up-success");
    } catch (error: unknown) {
      // If it's a Supabase error, check it again
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = String(error.message).toLowerCase();
        if (errorMessage.includes('already registered') || 
            errorMessage.includes('already exists') ||
            errorMessage.includes('user already registered') ||
            errorMessage.includes('email address is already registered') ||
            errorMessage.includes('email already registered') ||
            errorMessage.includes('invalid login credentials')) {
          router.push("/stella/sign-up-exists");
          return;
        }
      }
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign up</CardTitle>
          <CardDescription>Create a new account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignUp}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="repeat-password">Repeat Password</Label>
                </div>
                <Input
                  id="repeat-password"
                  type="password"
                  required
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full bg-red-500 hover:bg-red-600 text-white" disabled={isLoading}>
                {isLoading ? "Creating an account..." : "Sign up"}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link href="/stella/login" className="underline underline-offset-4">
                Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
