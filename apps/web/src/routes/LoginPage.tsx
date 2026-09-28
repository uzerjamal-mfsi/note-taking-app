import { Link } from "react-router";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginPage() {
  return (
    <Card className="mx-auto mt-12 w-full max-w-sm">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>
          Don&apos;t have an account? <Link to="/register">Create one</Link>
          <br />
          <Link to="/forgot-password">Forgot your password?</Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
