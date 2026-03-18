import { SignUpForm } from "@/components/sign-up-form";
import { ENABLE_SIGNUP } from "@/lib/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        {ENABLE_SIGNUP ? (
          <SignUpForm />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                Sign-up
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>We are currently testing Ask Stella! with a limited group of users.</p>
              <p>Public sign-up is temporarily disabled.</p>
              <p>
                If you&apos;d like early access, please email{" "}
                <a
                  href="mailto:pauljy@stanford.edu"
                  className="underline underline-offset-4"
                >
                  pauljy@stanford.edu
                </a>
                .
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
