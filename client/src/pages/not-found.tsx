import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4 bg-card border-border">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-8 w-8" />
              <h1 className="text-2xl font-bold text-foreground">404 Page Not Found</h1>
            </div>

            <p className="text-sm text-muted-foreground">
              The page you're looking for doesn't exist or has been moved.
            </p>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setLocation("/")}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                data-testid="button-go-home"
              >
                <Home className="h-4 w-4" />
                Go Home
              </button>
              <button
                onClick={() => window.history.back()}
                className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                data-testid="button-go-back"
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </button>
            </div>

            <div className="text-xs text-muted-foreground mt-4">
              hyperlinklaw.com Legal Document System
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
