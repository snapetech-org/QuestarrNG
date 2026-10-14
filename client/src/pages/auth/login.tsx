import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Lock, User } from "lucide-react";
import { GitHubVersionLink } from "@/components/GitHubVersionLink";
import { withBasePath } from "@/lib/app-path";
import { useInterfaceLanguage } from "@/lib/interface-locale";

type LoginForm = { username: string; password: string };

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  const loginSchema = useMemo(
    () =>
      z.object({
        username: z.string().min(1, "Username is required"),
        password: z.string().min(1, "Password is required"),
      }),
    []
  );
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginForm) => {
    await login(data);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center flex flex-col items-center gap-2">
          <img
            src={withBasePath("/Questarr_Logo-nobg.png")}
            alt={t("QuestarrNG Logo")}
            lang={languageFor("QuestarrNG Logo")}
            dir={directionFor("QuestarrNG Logo")}
            className="h-16 w-auto mb-2"
          />
          <CardTitle
            className="text-2xl font-bold"
            lang={languageFor("Welcome Back")}
            dir={directionFor("Welcome Back")}
          >
            {t("Welcome Back")}
          </CardTitle>
          <CardDescription
            lang={languageFor("Login to manage your game collection")}
            dir={directionFor("Login to manage your game collection")}
          >
            {t("Login to manage your game collection")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel lang={languageFor("Username")} dir={directionFor("Username")}>
                      {t("Username")}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder={t("Enter your username")}
                          lang={languageFor("Enter your username")}
                          dir="auto"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage
                      lang={languageFor("Username is required")}
                      dir={directionFor("Username is required")}
                    />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel lang={languageFor("Password")} dir={directionFor("Password")}>
                      {t("Password")}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="password"
                          className="pl-9"
                          autoComplete="current-password"
                          placeholder={t("Enter your password")}
                          lang={languageFor("Enter your password")}
                          dir={directionFor("Enter your password")}
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage
                      lang={languageFor("Password is required")}
                      dir={directionFor("Password is required")}
                    />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                <span
                  lang={languageFor(isLoading ? "Logging in..." : "Login")}
                  dir={directionFor(isLoading ? "Logging in..." : "Login")}
                >
                  {t(isLoading ? "Logging in..." : "Login")}
                </span>
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <div className="mt-4 flex items-center justify-center">
        <GitHubVersionLink />
      </div>
    </div>
  );
}
