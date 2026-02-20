import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card";
import Link from "next/link";
  
  export default function Page() {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">
                  An account with this email address already exists.
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Please{" "}
                  <Link href="/stella/login" className="underline underline-offset-2">
                    log in
                  </Link> with the existing account, or{" "}
                  <Link href="/stella/sign-up" className="underline underline-offset-2">
                    sign up
                  </Link> with a different email address.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }
