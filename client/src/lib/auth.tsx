import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch, apiRequest, setBearerToken, throwIfResNotOk } from "./queryClient";
import { disconnectSocket } from "./socket";
import { useToast } from "@/hooks/use-toast";

type User = {
  id: string;
  username: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  needsSetup: boolean;
  checkSetup: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

type FetchUserError = Error & { status?: number };

/** Remove a pre-cookie session token from persistent storage before any API request. */
function takeLegacyLocalStorageToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const legacyToken = localStorage.getItem("token");
    if (legacyToken) localStorage.removeItem("token");
    return legacyToken;
  } catch {
    return null;
  }
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Keep an old bearer token only as a fallback candidate. The first
  // /api/auth/me request must be cookie-only so a stale token cannot override
  // a valid cookie belonging to the current account.
  const pendingLegacyTokenRef = useRef<string | null>(null);
  const activeLegacyTokenRef = useRef<string | null>(null);
  const migrationRanRef = useRef(false);
  if (!migrationRanRef.current) {
    migrationRanRef.current = true;
    pendingLegacyTokenRef.current = takeLegacyLocalStorageToken();
    activeLegacyTokenRef.current = null;
    setBearerToken(null);
  }

  const {
    isLoading: isCheckingSetup,
    error: setupCheckError,
    data: statusData,
  } = useQuery({
    queryKey: ["/api/auth/status"],
    queryFn: async () => {
      const res = await apiFetch("/api/auth/status");
      await throwIfResNotOk(res);
      return await res.json();
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 60000, // Cache for 1 minute to avoid excessive checks
    refetchOnMount: "always",
  });

  // Derive needsSetup from query data
  useEffect(() => {
    if (statusData) {
      setNeedsSetup(!statusData.hasUsers);
    }
  }, [statusData]);

  const { isLoading: isFetchingUser, data: meData } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const legacyToken = activeLegacyTokenRef.current ?? pendingLegacyTokenRef.current;

      // Prefer the httpOnly cookie on every check. A validated legacy bearer
      // remains available in memory only if the cookie request is rejected.
      setBearerToken(null);
      let res = await apiFetch("/api/auth/me");

      if (res.ok) {
        pendingLegacyTokenRef.current = null;
        activeLegacyTokenRef.current = null;
        return await res.json();
      }

      if ((res.status === 401 || res.status === 403) && legacyToken) {
        setBearerToken(legacyToken);
        const legacyRes = await apiFetch("/api/auth/me");
        if (legacyRes.ok) {
          pendingLegacyTokenRef.current = null;
          activeLegacyTokenRef.current = legacyToken;
          return await legacyRes.json();
        }
        res = legacyRes;
      }

      if (res.status === 401 || res.status === 403) {
        setBearerToken(null);
        pendingLegacyTokenRef.current = null;
        activeLegacyTokenRef.current = null;
        // Drop every other cached query (stale authenticated data from a
        // prior session) but deliberately spare "/api/auth/status" and this
        // query itself -- removing a query while its fetch is in flight
        // strands its observers (setup/config screens, the login button via
        // isFetchingUser) on an indefinite loading state instead of letting
        // them re-resolve once the fetch settles (to null, here).
        queryClient.removeQueries({
          predicate: (query) =>
            query.queryKey[0] !== "/api/auth/status" && query.queryKey[0] !== "/api/auth/me",
        });
        return null;
      }

      await throwIfResNotOk(res);
      return null;
    },
    // Always attempt this -- a valid session may exist purely via the
    // httpOnly cookie, with nothing for the client to check beforehand.
    retry: (failureCount, error) => {
      const status = (error as FetchUserError).status;
      if (typeof status === "number") {
        if (status === 401 || status === 403) return false;
        if (status < 500) return false;
      }
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 30000, // 30 seconds — re-validate session periodically
    refetchOnMount: "always", // Always re-validate on AuthProvider mount
  });

  // Derive user from query data so it stays in sync even when served from cache
  useEffect(() => {
    if (meData) {
      setUser(meData);
    } else if (meData === null) {
      setUser(null);
    }
  }, [meData]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", credentials);
      const data = await res.json();
      // The server has already set the httpOnly auth + CSRF cookies; nothing
      // to store client-side. `data.token` is still returned for backward
      // compatibility with non-browser bearer clients, but the browser
      // client itself never persists it.
      //
      // A successful login replaces any legacy bearer-only session with the
      // fresh httpOnly cookie session.
      pendingLegacyTokenRef.current = null;
      activeLegacyTokenRef.current = null;
      setBearerToken(null);
      // Keep the "/api/auth/me" cache in step with the new session: cancel any
      // in-flight check first so a late 401 from before login can't land on
      // top and null the user out again.
      await queryClient.cancelQueries({ queryKey: ["/api/auth/me"] });
      queryClient.setQueryData(["/api/auth/me"], data.user);
      setUser(data.user);
    },
    onSuccess: () => {
      toast({ title: "Logged in successfully" });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const login = async (credentials: { username: string; password: string }) => {
    await loginMutation.mutateAsync(credentials);
  };

  const logout = async () => {
    // Wait for the server to actually clear the httpOnly session cookie
    // before dropping local state. If this fails (network error, 500,
    // etc.), the server-side session is still live, so acting as if we'd
    // logged out would let a later page load / auth/me check silently
    // restore it -- leave local state untouched and let the user retry.
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch (error) {
      toast({
        title: "Logout failed",
        description:
          error instanceof Error
            ? error.message
            : "Unable to reach the server. Please check your connection and try again.",
        variant: "destructive",
      });
      return;
    }
    pendingLegacyTokenRef.current = null;
    activeLegacyTokenRef.current = null;
    setBearerToken(null);
    disconnectSocket();
    setUser(null);
    queryClient.clear();
    setLocation("/login");
  };

  const checkSetup = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/status"] });
  };

  // Redirect logic
  useEffect(() => {
    if (isCheckingSetup || isFetchingUser) return;

    // Show error if setup check failed after retries
    if (setupCheckError) {
      toast({
        title: "Connection Error",
        description: "Unable to connect to the server. Please check your connection and refresh.",
        variant: "destructive",
      });
      return;
    }

    // Fall back to meData directly: on the render where isFetchingUser first flips to
    // false, the "derive user" effect above hasn't flushed its setUser call yet, so
    // `user` can still be stale. Reading meData here avoids acting on that stale value.
    const isAuthenticated = !!(user ?? meData);

    if (needsSetup && location !== "/setup") {
      setLocation("/setup");
    } else if (!needsSetup && !isAuthenticated && location !== "/login" && location !== "/setup") {
      setLocation("/login");
    } else if (isAuthenticated && (location === "/login" || location === "/setup")) {
      setLocation("/");
    }
  }, [
    user,
    meData,
    needsSetup,
    location,
    setLocation,
    isCheckingSetup,
    isFetchingUser,
    setupCheckError,
    toast,
  ]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: isCheckingSetup || isFetchingUser || loginMutation.isPending,
        login,
        logout,
        needsSetup,
        checkSetup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
