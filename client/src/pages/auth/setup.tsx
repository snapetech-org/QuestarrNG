import React, { useMemo, useState } from "react";
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
import { routePaths } from "@/lib/routes";
import { PASSWORD_MIN_LENGTH, type Downloader, type Indexer } from "@shared/schema";
import { IgdbHelpPopover, IgdbTestConnectionButton } from "@/components/IgdbCredentialsHelper";
import { InterfaceLanguageSelect } from "@/components/InterfaceLanguageSelect";
import { ApiErrorDescription } from "@/components/ApiErrorDescription";
import { useInterfaceLanguage } from "@/lib/interface-locale";

type SetupForm = {
  username: string;
  password: string;
  confirmPassword: string;
  igdbClientId: string | undefined;
  igdbClientSecret: string | undefined;
};

export default function SetupPage() {
  const { toast } = useToast();
  const [setupComplete, setSetupComplete] = useState(false);
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

  const {
    data: configuredIndexers = [],
    isError: indexersStatusFailed,
    isLoading: isLoadingIndexers,
  } = useQuery<Indexer[]>({
    queryKey: ["/api/indexers"],
    enabled: setupComplete,
  });
  const {
    data: configuredDownloaders = [],
    isError: downloadersStatusFailed,
    isLoading: isLoadingDownloaders,
  } = useQuery<Downloader[]>({
    queryKey: ["/api/downloaders"],
    enabled: setupComplete,
  });
  const isLoadingAcquisitionStatus = isLoadingIndexers || isLoadingDownloaders;
  const hasEnabledIndexer =
    Array.isArray(configuredIndexers) && configuredIndexers.some((indexer) => indexer.enabled);
  const hasEnabledDownloader =
    Array.isArray(configuredDownloaders) &&
    configuredDownloaders.some((downloader) => downloader.enabled);
  const acquisitionPath = !hasEnabledIndexer
    ? routePaths.indexers
    : !hasEnabledDownloader
      ? routePaths.downloaders
      : routePaths.search;

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
      toast({ title: "interface.setup_complete_welcome_25138a36" });
      // Keep this confirmation local to the current setup screen. Choosing a
      // destination performs a full navigation so the new httpOnly session is
      // picked up by the normal authenticated app flow.
      setSetupComplete(true);
    },
    onError: (error: Error) => {
      toast({
        title: "interface.setup_failed_fea065f3",
        description: <ApiErrorDescription error={error} />,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SetupForm) => {
    setupMutation.mutate(data);
  };

  const continueTo = (path: string) => {
    window.location.href = withBasePath(path);
  };

  if (setupComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>{t("interface.your_questarrng_setup_is_ready_08fc7690")}</CardTitle>
            <CardDescription>
              {t("interface.choose_what_you_want_to_do_first_y_297e271a")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Button
              className="h-auto min-h-24 flex-col items-start whitespace-normal p-4 text-start"
              onClick={() => continueTo(routePaths.discover)}
            >
              <span className="font-semibold">{t("interface.browse_game_catalog_96a51dd8")}</span>
              <span className="mt-1 text-xs font-normal opacity-80">
                {t("interface.explore_and_track_games_without_se_8cd0c32b")}
              </span>
            </Button>
            <Button
              className="h-auto min-h-24 flex-col items-start whitespace-normal p-4 text-start"
              onClick={() => continueTo(acquisitionPath)}
              disabled={isLoadingAcquisitionStatus}
            >
              <span className="font-semibold">{t("interface.acquire_releases_2d1d08fb")}</span>
              <span className="mt-1 text-xs font-normal opacity-80">
                {isLoadingAcquisitionStatus
                  ? t("interface.checking_your_existing_acquisition_bd64ebbf")
                  : indexersStatusFailed || downloadersStatusFailed
                    ? t("interface.open_the_existing_indexer_and_down_8fd65ea9")
                    : !hasEnabledIndexer
                      ? t("interface.add_an_indexer_to_search_for_game_ebd6bc3e")
                      : !hasEnabledDownloader
                        ? t("interface.add_a_downloader_to_send_a_release_45192b09")
                        : t("interface.search_for_releases_for_games_in_y_48726b11")}
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto min-h-24 flex-col items-start whitespace-normal p-4 text-start"
              onClick={() => continueTo(routePaths.libraryImport)}
            >
              <span className="font-semibold">
                {t("interface.organize_existing_downloads_e09b05e4")}
              </span>
              <span className="mt-1 text-xs font-normal opacity-80">
                {t("interface.configure_library_imports_for_file_6d77e54d")}
              </span>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 gap-6">
      <Alert className="max-w-md border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <Info className="h-4 w-4" />
        <AlertTitle
          lang={languageFor("interface.upgrading_from_v1_0_08dfd0e0")}
          dir={directionFor("interface.upgrading_from_v1_0_08dfd0e0")}
        >
          {t("interface.upgrading_from_v1_0_08dfd0e0")}
        </AlertTitle>
        <AlertDescription>
          <div className="mt-2 text-sm space-y-2">
            <p
              lang={languageFor("interface.if_you_are_upgrading_from_an_older_b29c9106")}
              dir={directionFor("interface.if_you_are_upgrading_from_an_older_b29c9106")}
            >
              {t("interface.if_you_are_upgrading_from_an_older_b29c9106")}{" "}
              <strong
                lang={languageFor("interface.do_not_create_a_new_account_393f0571")}
                dir={directionFor("interface.do_not_create_a_new_account_393f0571")}
              >
                {t("interface.do_not_create_a_new_account_393f0571")}
              </strong>
              .
            </p>
            <p
              lang={languageFor("interface.you_must_migrate_your_data_to_the_6216e94f")}
              dir={directionFor("interface.you_must_migrate_your_data_to_the_6216e94f")}
            >
              {t("interface.you_must_migrate_your_data_to_the_6216e94f")}
            </p>
            <a
              href="https://github.com/snapetech-org/QuestarrNG/blob/main/docs/MIGRATION.md"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-4 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
            >
              <span
                lang={languageFor("interface.read_migration_guide_d53088c9")}
                dir={directionFor("interface.read_migration_guide_d53088c9")}
              >
                {t("interface.read_migration_guide_d53088c9")}
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
            lang={languageFor("interface.initial_setup_a04f9a7a")}
            dir={directionFor("interface.initial_setup_a04f9a7a")}
          >
            {t("interface.initial_setup_a04f9a7a")}
          </CardTitle>
          <CardDescription
            lang={languageFor("interface.create_your_admin_account_to_get_s_bb28e574")}
            dir={directionFor("interface.create_your_admin_account_to_get_s_bb28e574")}
          >
            {t("interface.create_your_admin_account_to_get_s_bb28e574")}
          </CardDescription>
          <div className="mt-4 space-y-2 text-start">
            <label htmlFor="setup-interface-language" className="text-sm font-medium">
              <span
                lang={languageFor("interface.interface_language_66eac25a")}
                dir={directionFor("interface.interface_language_66eac25a")}
              >
                {t("interface.interface_language_66eac25a")}
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
                    <FormLabel
                      lang={languageFor("interface.username_1c08d4d9")}
                      dir={directionFor("interface.username_1c08d4d9")}
                    >
                      {t("interface.username_1c08d4d9")}
                    </FormLabel>
                    <div className="relative">
                      <User className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                      <FormControl>
                        <Input
                          className="ps-9"
                          placeholder={t("interface.choose_a_username_bb3303d5")}
                          lang={languageFor("interface.choose_a_username_bb3303d5")}
                          dir="auto"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage
                      lang={languageFor("interface.username_must_be_at_least_3_charac_d1c3c390")}
                      dir={directionFor("interface.username_must_be_at_least_3_charac_d1c3c390")}
                    />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel
                      lang={languageFor("interface.password_2cc30838")}
                      dir={directionFor("interface.password_2cc30838")}
                    >
                      {t("interface.password_2cc30838")}
                    </FormLabel>
                    <div className="relative">
                      <Lock className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                      <FormControl>
                        <Input
                          type="password"
                          className="ps-9"
                          placeholder={t("interface.choose_a_password_d74f1a34")}
                          lang={languageFor("interface.choose_a_password_d74f1a34")}
                          dir={directionFor("interface.choose_a_password_d74f1a34")}
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormDescription
                      lang={languageFor("interface.at_least_8_characters_including_on_2a6832ca")}
                      dir={directionFor("interface.at_least_8_characters_including_on_2a6832ca")}
                    >
                      {t("interface.at_least_8_characters_including_on_2a6832ca")}
                    </FormDescription>
                    <FormMessage
                      lang={languageFor("interface.password_must_be_at_least_8_charac_3c38435e")}
                      dir={directionFor("interface.password_must_be_at_least_8_charac_3c38435e")}
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
                      lang={languageFor("interface.confirm_password_fbf2f740")}
                      dir={directionFor("interface.confirm_password_fbf2f740")}
                    >
                      {t("interface.confirm_password_fbf2f740")}
                    </FormLabel>
                    <div className="relative">
                      <Lock className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                      <FormControl>
                        <Input
                          type="password"
                          className="ps-9"
                          placeholder={t("interface.confirm_your_password_0e47abbb")}
                          lang={languageFor("interface.confirm_your_password_0e47abbb")}
                          dir={directionFor("interface.confirm_your_password_0e47abbb")}
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage
                      lang={languageFor("interface.passwords_do_not_match_a8bf4976")}
                      dir={directionFor("interface.passwords_do_not_match_a8bf4976")}
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
                        lang={languageFor("interface.igdb_configuration_2007c8b1")}
                        dir={directionFor("interface.igdb_configuration_2007c8b1")}
                      >
                        <Gamepad2 className="h-4 w-4" />
                        {t("interface.igdb_configuration_2007c8b1")}
                      </h3>
                      <IgdbHelpPopover />
                    </div>
                    <p
                      className="text-sm text-muted-foreground mb-4"
                      lang={languageFor("interface.igdb_credentials_are_required_to_d_db32487d")}
                      dir={directionFor("interface.igdb_credentials_are_required_to_d_db32487d")}
                    >
                      {t("interface.igdb_credentials_are_required_to_d_db32487d")}
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="igdbClientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel
                          lang={languageFor("interface.client_id_96a12137")}
                          dir={directionFor("interface.client_id_96a12137")}
                        >
                          {t("interface.client_id_96a12137")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("interface.igdb_client_id_397a9eef")}
                            lang={languageFor("interface.igdb_client_id_397a9eef")}
                            dir="ltr"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage
                          lang={languageFor("interface.igdb_client_id_is_required_d2fb5b82")}
                          dir={directionFor("interface.igdb_client_id_is_required_d2fb5b82")}
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
                          lang={languageFor("interface.client_secret_603b406a")}
                          dir={directionFor("interface.client_secret_603b406a")}
                        >
                          {t("interface.client_secret_603b406a")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder={t("interface.igdb_client_secret_472349b2")}
                            lang={languageFor("interface.igdb_client_secret_472349b2")}
                            dir="ltr"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage
                          lang={languageFor("interface.igdb_client_secret_is_required_632c4bc7")}
                          dir={directionFor("interface.igdb_client_secret_is_required_632c4bc7")}
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
