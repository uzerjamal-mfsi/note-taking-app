import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useNavigate } from "react-router";
import { resetPasswordRequestSchema, type ResetPasswordRequest } from "@note-taking-app/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useResetPasswordMutation } from "../api/use-reset-password-mutation.js";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const GENERIC_RESET_ERROR_MESSAGE =
  "Invalid or expired code. Please request a new one and try again.";

export function ResetPasswordForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefilledEmail = (location.state as { email?: string } | null)?.email ?? "";
  const form = useForm<ResetPasswordRequest>({
    resolver: zodResolver(resetPasswordRequestSchema),
    defaultValues: { email: prefilledEmail, otp: "", newPassword: "" },
  });
  const mutation = useResetPasswordMutation();

  function onSubmit(values: ResetPasswordRequest) {
    mutation.mutate(values, {
      onSuccess: () => {
        navigate("/login", { replace: true });
      },
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
        {mutation.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{GENERIC_RESET_ERROR_MESSAGE}</AlertDescription>
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
          name="otp"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Code</FormLabel>
              <FormControl>
                <Input inputMode="numeric" autoComplete="one-time-code" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={mutation.isPending}>
          Reset password
        </Button>
      </form>
    </Form>
  );
}
