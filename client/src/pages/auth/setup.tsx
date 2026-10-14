import React, { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
// import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Lock, User, ShieldCheck, Gamepad2, Info, ExternalLink } from "lucide-react";
import { withBasePath } from "@/lib/app-path";
import { PASSWORD_MIN_LENGTH } from "@shared/schema";
import { IgdbHelpPopover, IgdbTestConnectionButton } from "@/components/IgdbCredentialsHelper";
import { InterfaceLanguageSelect } from "@/components/InterfaceLanguageSelect";
import { useInterfaceLanguage } from "@/lib/interface-locale";

type SetupForm = {
  username: string;
  password: string;
  confirmPassword: string;
  igdbClientId: string | undefined;
  igdbClientSecret: string | undefined;
};

export default function SetupPage() {
  const { checkSetup } = useAuth();
  const { toast } = useToast();
  const { language, setLanguage, t, languageFor, directionFor } = useInterfaceLanguage();
  // const [_, setLocation] = useLocation();

  // GET /api/config requires authentication, which doesn't exist yet during
  // setup, so the IGDB-configured status is read from the unauthenticated
  // GET /api/auth/status endpoint instead (shares the query cache with
  // AuthProvider's own status check).
  const { data: statusData, isLoading: isLoadingConfig } = useQuery({
    queryKey: ["/api/auth/status"],
    queryFn: () => apiRequest("GET", "/api/auth/status").then((res) => res.json()),
  });
  const config = statusData;

  const setupSchema = useMemo(() => {
    const isIgdbConfigured = config?.igdb?.configured;

    return z
      .object({
        username: z.string().min(3, "Username must be at least 3 characters"),
        password: z
          .string()
          .trim()
          .min(PASSWORD_MIN_LENGTH, "Password must be at least 8 characters")
          .regex(/[A-Za-z]/, "Password must contain at least one letter")
          .regex(/[0-9]/, "Password must contain at least one number"),
        confirmPassword: z.string().trim(),
        igdbClientId: isIgdbConfigured
          ? z.string().optional()
          : z.string().min(1, "IGDB Client ID is required"),
        igdbClientSecret: isIgdbConfigured
          ? z.string().optional()
          : z.string().min(1, "IGDB Client Secret is required"),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
      });
  }, [config]);

  const form = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      igdbClientId: "",
      igdbClientSecret: "",
    },
  });

  const setupMutation = useMutation({
    mutationFn: async (data: SetupForm) => {
      const res = await apiRequest("POST", "/api/auth/setup", {
        username: data.username,
        password: data.password,
        igdbClientId: data.igdbClientId,
        igdbClientSecret: data.igdbClientSecret,
      });
      return res.json();
    },
    onSuccess: async () => {
      // The server has already set the httpOnly auth cookie; nothing to
      // store client-side (see server/security.ts's setAuthCookies).
      await checkSetup();
      toast({ title: t("Setup complete! Welcome.") });
      // Force reload to pick up auth state or navigate
      window.location.href = withBasePath("/");
    },
    onError: (error: Error) => {
      toast({
        title: t("Setup failed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SetupForm) => {
    setupMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 gap-6">
      <Alert className="max-w-md border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <Info className="h-4 w-4" />
        <AlertTitle
          lang={languageFor("Upgrading from v1.0?")}
          dir={directionFor("Upgrading from v1.0?")}
        >
          {t("Upgrading from v1.0?")}
        </AlertTitle>
        <AlertDescription>
          <div className="mt-2 text-sm space-y-2">
            <p
              lang={languageFor("If you are upgrading from an older version (PostgreSQL),")}
              dir={directionFor("If you are upgrading from an older version (PostgreSQL),")}
            >
              {t("If you are upgrading from an older version (PostgreSQL),")}{" "}
              <strong
                lang={languageFor("do not create a new account")}
                dir={directionFor("do not create a new account")}
              >
                {t("do not create a new account")}
              </strong>
              .
            </p>
            <p
              lang={languageFor(
                "You must migrate your data to the new database format first, otherwise your library will be empty."
              )}
              dir={directionFor(
                "You must migrate your data to the new database format first, otherwise your library will be empty."
              )}
            >
              {t(
                "You must migrate your data to the new database format first, otherwise your library will be empty."
              )}
            </p>
            <a
              href="https://github.com/snapetech-org/QuestarrNG/blob/main/docs/MIGRATION.md"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-4 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
            >
              <span
                lang={languageFor("Read Migration Guide")}
                dir={directionFor("Read Migration Guide")}
              >
                {t("Read Migration Guide")}
              </span>{" "}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </AlertDescription>
      </Alert>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <CardTitle
            className="text-2xl font-bold"
            lang={languageFor("Initial Setup")}
            dir={directionFor("Initial Setup")}
          >
            {t("Initial Setup")}
          </CardTitle>
          <CardDescription
            lang={languageFor("Create your admin account to get started")}
            dir={directionFor("Create your admin account to get started")}
          >
            {t("Create your admin account to get started")}
          </CardDescription>
          <div className="mt-4 space-y-2 text-left">
            <label htmlFor="setup-interface-language" className="text-sm font-medium">
              <span
                lang={languageFor("Interface language")}
                dir={directionFor("Interface language")}
              >
                {t("Interface language")}
              </span>
            </label>
            <InterfaceLanguageSelect
              id="setup-interface-language"
              value={language}
              onValueChange={setLanguage}
              className="w-full"
            />
          </div>
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
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <FormControl>
                        <Input
                          className="pl-9"
                          placeholder={t("Choose a username")}
                          lang={languageFor("Choose a username")}
                          dir="auto"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage
                      lang={languageFor("Username must be at least 3 characters")}
                      dir={directionFor("Username must be at least 3 characters")}
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
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <FormControl>
                        <Input
                          type="password"
                          className="pl-9"
                          placeholder={t("Choose a password")}
                          lang={languageFor("Choose a password")}
                          dir={directionFor("Choose a password")}
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormDescription
                      lang={languageFor(
                        "At least 8 characters, including one letter and one number."
                      )}
                      dir={directionFor(
                        "At least 8 characters, including one letter and one number."
                      )}
                    >
                      {t("At least 8 characters, including one letter and one number.")}
                    </FormDescription>
                    <FormMessage
                      lang={languageFor("Password must be at least 8 characters")}
                      dir={directionFor("Password must be at least 8 characters")}
                    />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel
                      lang={languageFor("Confirm Password")}
                      dir={directionFor("Confirm Password")}
                    >
                      {t("Confirm Password")}
                    </FormLabel>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <FormControl>
                        <Input
                          type="password"
                          className="pl-9"
                          placeholder={t("Confirm your password")}
                          lang={languageFor("Confirm your password")}
                          dir={directionFor("Confirm your password")}
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage
                      lang={languageFor("Passwords do not match")}
                      dir={directionFor("Passwords do not match")}
                    />
                  </FormItem>
                )}
              />

              {config && !config.igdb?.configured && (
                <>
                  <div className="border-t my-4 pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h3
                        className="font-medium flex items-center gap-2"
                        lang={languageFor("IGDB Configuration")}
                        dir={directionFor("IGDB Configuration")}
                      >
                        <Gamepad2 className="h-4 w-4" />
                        {t("IGDB Configuration")}
                      </h3>
                      <IgdbHelpPopover />
                    </div>
                    <p
                      className="text-sm text-muted-foreground mb-4"
                      lang={languageFor(
                        "IGDB credentials are required to discover and import games."
                      )}
                      dir={directionFor(
                        "IGDB credentials are required to discover and import games."
                      )}
                    >
                      {t("IGDB credentials are required to discover and import games.")}
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="igdbClientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel lang={languageFor("Client ID")} dir={directionFor("Client ID")}>
                          {t("Client ID")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("IGDB Client ID")}
                            lang={languageFor("IGDB Client ID")}
                            dir="ltr"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage
                          lang={languageFor("IGDB Client ID is required")}
                          dir={directionFor("IGDB Client ID is required")}
                        />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="igdbClientSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel
                          lang={languageFor("Client Secret")}
                          dir={directionFor("Client Secret")}
                        >
                          {t("Client Secret")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder={t("IGDB Client Secret")}
                            lang={languageFor("IGDB Client Secret")}
                            dir="ltr"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage
                          lang={languageFor("IGDB Client Secret is required")}
                          dir={directionFor("IGDB Client Secret is required")}
                        />
                      </FormItem>
                    )}
                  />

                  <IgdbTestConnectionButton
                    clientId={form.watch("igdbClientId") ?? ""}
                    clientSecret={form.watch("igdbClientSecret") ?? ""}
                    testEndpoint="/api/auth/setup/test-igdb"
                  />
                </>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={setupMutation.isPending || isLoadingConfig}
              >
                {(() => {
                  const label = isLoadingConfig
                    ? "Loading..."
                    : setupMutation.isPending
                      ? "Creating Account..."
                      : "Create Account";
                  return (
                    <span lang={languageFor(label)} dir={directionFor(label)}>
                      {t(label)}
                    </span>
                  );
                })()}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
