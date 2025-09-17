import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

interface User {
  id: string;
  email: string;
  name?: string;
}

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ['/api/auth/user'],
    queryFn: getQueryFn<User>({ on401: "returnNull" }),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes - prevent rapid refetching
    gcTime: 10 * 60 * 1000, // 10 minutes cache
  });

  // More stable authentication determination
  const isAuthenticated = !isLoading && !!user && !error;

  return {
    user,
    isLoading,
    isAuthenticated,
  };
}