import { Link } from "react-router";
import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ForgotPasswordPage() {
  return (
    <Card className="mx-auto mt-12 w-full max-w-sm">
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>
          <Link to="/login">Back to log in</Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
