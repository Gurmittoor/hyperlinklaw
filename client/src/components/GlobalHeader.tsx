import { Scale, LogOut, User } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface User {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
}

export default function GlobalHeader() {
  const { user, isAuthenticated } = useAuth();

  const getUserInitials = (user: User | null) => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`;
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const getDisplayName = (user: User | null) => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user?.email || "User";
  };

  return (
    <header className="border-b bg-white dark:bg-slate-950">
      <div className="flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center space-x-2">
          <Scale className="h-6 w-6 text-blue-600" />
          <span className="font-bold text-lg">hyperlinklaw.com</span>
        </Link>
        
        {isAuthenticated && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full" data-testid="button-user-menu">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={(user as User)?.profileImageUrl || ''} alt={getDisplayName(user)} />
                  <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex flex-col space-y-1 p-2">
                <p className="text-sm font-medium leading-none" data-testid="text-user-name">{getDisplayName(user)}</p>
                <p className="text-xs leading-none text-muted-foreground" data-testid="text-user-email">{(user as User).email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/" className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  <span>Dashboard</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.location.href = '/api/logout'} data-testid="button-logout">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button 
            onClick={() => {
              // In production, redirect to app subdomain for login
              const isProduction = window.location.hostname === 'hyperlinklaw.com';
              const loginUrl = isProduction 
                ? 'https://app.hyperlinklaw.com/api/login'
                : '/api/login';
              window.location.href = loginUrl;
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="button-signin-header"
          >
            Sign In to Get Started
          </Button>
        )}
      </div>
    </header>
  );
}