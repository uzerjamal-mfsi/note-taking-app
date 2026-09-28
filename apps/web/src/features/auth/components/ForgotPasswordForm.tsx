import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router";
import { forgotPasswordRequestSchema, type ForgotPasswordRequest } from "@note-taking-app/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useForgotPasswordMutation } from "../api/use-forgot-password-mutation.js";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const NEUTRAL_CONFIRMATION_MESSAGE = "If that email is registered, we've sent a reset code to it.";

export function ForgotPasswordForm() {
  const form = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordRequestSchema),
    defaultValues: { email: "" },
  });
  const mutation = useForgotPasswordMutation();

  function onSubmit(values: ForgotPasswordRequest) {
    mutation.mutate(values);
  }

  if (mutation.isSuccess) {
    const email = form.getValues("email");
    return (
      <div className="grid gap-4">
        <Alert>
          <AlertDescription>{NEUTRAL_CONFIRMATION_MESSAGE}</AlertDescription>
        </Alert>
        <Button asChild>
          <Link to="/reset-password" state={{ email }}>
            Enter code
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
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
        <Button type="submit" disabled={mutation.isPending}>
          Send reset code
        </Button>
      </form>
    </Form>
  );
}
