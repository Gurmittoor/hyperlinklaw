import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    
    // Silently ignore rate limit errors to prevent console spam
    if (res.status === 429) {
      console.warn('Rate limit reached - backing off');
      throw new Error(`${res.status}: Rate limit reached`);
    }
    
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  body?: any,
  options: RequestInit = {}
): Promise<any> {
  const { timeout = 30 * 60 * 1000, ...fetchOptions } = options as any; // 30 minutes default timeout
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      ...fetchOptions,
      credentials: "include",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    await throwIfResNotOk(res);
    
    // Handle 204 No Content responses (like DELETE operations)
    if (res.status === 204) {
      return null;
    }
    
    return res.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    // Handle 304 Not Modified - the cached data is still valid
    if (res.status === 304) {
      const cached = queryClient.getQueryData(queryKey);
      if (cached !== undefined) {
        return cached;
      }
      // If no cached data, fetch fresh data
      const fresh = await fetch(url, { 
        credentials: "include", 
        cache: "no-store" 
      });
      await throwIfResNotOk(fresh);
      return fresh.status === 204 ? null : await fresh.json();
    }

    await throwIfResNotOk(res);
    return res.status === 204 ? null : await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 300000, // 5 minutes to reduce frequent requests
      gcTime: 600000, // 10 minutes
      retry: (failureCount, error: any) => {
        // Don't retry on 401/403 errors  
        if (error?.message?.includes('401') || 
            error?.message?.includes('403')) {
          return false;
        }
        // Retry 429 (rate limit) errors with exponential backoff
        if (error?.message?.includes('429')) {
          return failureCount < 3; // Max 3 retries for rate limits
        }
        return failureCount < 2; // Max 2 retries for other errors
      },
      retryDelay: (attemptIndex, error: any) => {
        // Exponential backoff for rate limit errors
        if (error?.message?.includes('429')) {
          return Math.min(1000 * (2 ** attemptIndex), 30000); // 1s, 2s, 4s, max 30s
        }
        return 1000; // 1 second for other errors
      },
    },
    mutations: {
      retry: (failureCount, error: any) => {
        // Don't retry on auth errors
        if (error?.message?.includes('401') || 
            error?.message?.includes('403')) {
          return false;
        }
        // Retry rate limit errors with backoff
        if (error?.message?.includes('429')) {
          return failureCount < 3; // Max 3 retries for rate limits
        }
        return failureCount < 1; // Allow one retry for other errors
      },
      retryDelay: (attemptIndex, error: any) => {
        // Exponential backoff for rate limit errors
        if (error?.message?.includes('429')) {
          return Math.min(2000 * (2 ** attemptIndex), 60000); // 2s, 4s, 8s, max 60s
        }
        return 1000; // 1 second for other errors
      },
    },
  },
});
