import { Link } from "react-router";
import { ResetPasswordForm } from "@/features/auth/components/ResetPasswordForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ResetPasswordPage() {
  return (
    <Card className="mx-auto mt-12 w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>
          <Link to="/login">Back to log in</Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
