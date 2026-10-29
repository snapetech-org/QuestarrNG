import { useEffect, useMemo, useState } from "react";
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
import { apiFetch } from "@/lib/queryClient";
import { getOidcProviderPresentation } from "@/lib/oidc-provider";

type LoginForm = { username: string; password: string };

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [oidcProvider, setOidcProvider] = useState("generic");
  const oidcFailed = new URLSearchParams(window.location.search).get("oidcFailed") === "true";

  useEffect(() => {
    let active = true;
    void apiFetch("/api/auth/oidc/status")
      .then(async (response) =>
        response.ok ? ((await response.json()) as { enabled?: boolean; provider?: string }) : null
      )
      .then((status) => {
        if (active) {
          setOidcEnabled(status?.enabled === true);
          setOidcProvider(status?.provider ?? "generic");
        }
      })
      .catch(() => {
        if (active) {
          setOidcEnabled(false);
          setOidcProvider("generic");
        }
      });
    return () => {
      active = false;
    };
  }, []);
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
  const oidcPresentation = getOidcProviderPresentation(oidcProvider);

  const onSubmit = async (data: LoginForm) => {
    await login(data);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center flex flex-col items-center gap-2">
          <img
            src={withBasePath("/Questarr_Logo-nobg.png")}
            alt={t("interface.questarrng_logo_c8b19c6a")}
            lang={languageFor("interface.questarrng_logo_c8b19c6a")}
            dir={directionFor("interface.questarrng_logo_c8b19c6a")}
            className="h-16 w-auto mb-2"
          />
          <CardTitle
            className="text-2xl font-bold"
            lang={languageFor("interface.welcome_back_cb897846")}
            dir={directionFor("interface.welcome_back_cb897846")}
          >
            {t("interface.welcome_back_cb897846")}
          </CardTitle>
          <CardDescription
            lang={languageFor("interface.login_to_manage_your_game_collecti_af64167b")}
            dir={directionFor("interface.login_to_manage_your_game_collecti_af64167b")}
          >
            {t("interface.login_to_manage_your_game_collecti_af64167b")}
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
                    <FormLabel lang={languageFor("interface.username_1c08d4d9")} dir={directionFor("interface.username_1c08d4d9")}>
                      {t("interface.username_1c08d4d9")}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="ps-9"
                          placeholder={t("interface.enter_your_username_50b9f4ac")}
                          lang={languageFor("interface.enter_your_username_50b9f4ac")}
                          dir="auto"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage
                      lang={languageFor("interface.username_is_required_6d2b33f8")}
                      dir={directionFor("interface.username_is_required_6d2b33f8")}
                    />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel lang={languageFor("interface.password_2cc30838")} dir={directionFor("interface.password_2cc30838")}>
                      {t("interface.password_2cc30838")}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="password"
                          className="ps-9"
                          autoComplete="current-password"
                          placeholder={t("interface.enter_your_password_7b5830fd")}
                          lang={languageFor("interface.enter_your_password_7b5830fd")}
                          dir={directionFor("interface.enter_your_password_7b5830fd")}
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage
                      lang={languageFor("interface.password_is_required_dd9a7069")}
                      dir={directionFor("interface.password_is_required_dd9a7069")}
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
            {oidcFailed && (
              <p className="text-sm text-destructive" role="alert">
                {t(
                  "interface.identity_provider_sign_in_failed_c_86dc0d0c"
                )}
              </p>
            )}
            {oidcEnabled && (
              <div className="mt-4 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => window.location.assign(withBasePath("/api/auth/oidc/login"))}
                >
                  <svg aria-hidden="true" className="me-2 h-5 w-5" viewBox="0 0 24 24">
                    <use
                      href={withBasePath(`/oidc-provider-icons.svg#oidc-${oidcPresentation.icon}`)}
                    />
                  </svg>
                  {t("interface.continue_with_5b5c8ac4")} <bdi dir="auto">{t(oidcPresentation.labelKey)}</bdi>
                </Button>
                <a
                  className="block text-center text-sm text-muted-foreground underline underline-offset-4"
                  href={oidcPresentation.setupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${t(oidcPresentation.labelKey)} identity provider setup guide (opens in a new tab)`}
                >
                  {t("interface.provider_setup_guide_9f61fa39")} <span aria-hidden="true">↗</span>
                </a>
              </div>
            )}
          </Form>
        </CardContent>
      </Card>
      <div className="mt-4 flex items-center justify-center">
        <GitHubVersionLink />
      </div>
    </div>
  );
}
