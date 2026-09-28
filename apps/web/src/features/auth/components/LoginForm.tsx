import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useNavigate } from "react-router";
import { loginRequestSchema, type LoginRequest } from "@note-taking-app/shared";
import { useSessionStore } from "@/store/session-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLoginMutation } from "../api/use-login-mutation.js";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function LoginForm() {
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: "", password: "" },
  });
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useSessionStore((state) => state.setSession);
  const mutation = useLoginMutation();

  function onSubmit(values: LoginRequest) {
    mutation.mutate(values, {
      onSuccess: (data) => {
        setSession(data);
        const from = (
          location.state as { from?: { pathname: string; search: string; hash: string } } | null
        )?.from;
        navigate(from ?? "/", { replace: true });
      },
    });
  }

  const errorMessage = mutation.isError ? mutation.error.message : null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={mutation.isPending}>
          Log in
        </Button>
      </form>
    </Form>
  );
}
