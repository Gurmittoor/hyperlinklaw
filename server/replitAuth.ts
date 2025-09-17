import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    name: "__hlaw.sid",
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: "lax",
      maxAge: sessionTtl,
      // Scoped to the subdomain for production
      domain: process.env.NODE_ENV === 'production' ? "app.hyperlinklaw.com" : undefined,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  console.log('🔐 Starting authentication setup...');
  
  try {
    app.set("trust proxy", 1);
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());

    console.log('🔐 Getting OIDC config...');
    const config = await getOidcConfig();
    console.log('🔐 OIDC config obtained successfully');

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const domains = process.env.REPLIT_DOMAINS!.split(",");
  console.log(`🔐 Setting up authentication for domains: ${domains.join(', ')}`);
  
  for (const domain of domains) {
    const strategyName = `replitauth:${domain}`;
    console.log(`🔐 Registering strategy: ${strategyName}`);
    
    const strategy = new Strategy(
      {
        name: strategyName,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
    console.log(`✅ Strategy registered: ${strategyName}`);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));
  
  console.log('✅ Authentication setup completed successfully!');
  
  } catch (error) {
    console.error('❌ Authentication setup failed:', error);
    throw error;
  }

  app.get("/api/login", (req, res, next) => {
    // In production, redirect to app subdomain if accessing from main domain
    if (process.env.NODE_ENV === 'production' && req.hostname === 'hyperlinklaw.com') {
      const appUrl = process.env.APP_BASE_URL || "https://app.hyperlinklaw.com";
      return res.redirect(`${appUrl}/api/login`);
    }
    
    // Use the configured domain from REPLIT_DOMAINS instead of req.hostname
    const domains = process.env.REPLIT_DOMAINS!.split(",");
    const strategyName = `replitauth:${domains[0]}`;
    
    console.log(`🔐 Authentication attempt with strategy: ${strategyName}`);
    console.log(`🔍 Request hostname: ${req.hostname}`);
    console.log(`🔍 Available domains: ${domains.join(', ')}`);
    
    passport.authenticate(strategyName, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    // Use the configured domain from REPLIT_DOMAINS instead of req.hostname
    const domains = process.env.REPLIT_DOMAINS!.split(",");
    const strategyName = `replitauth:${domains[0]}`;
    
    console.log(`🔐 Authentication callback with strategy: ${strategyName}`);
    
    passport.authenticate(strategyName, {
      successReturnToOrRedirect: process.env.NODE_ENV === 'production' 
        ? process.env.APP_BASE_URL + "/auth/callback" || "https://app.hyperlinklaw.com/auth/callback"
        : "/auth/callback",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", async (req, res) => {
    const config = await getOidcConfig();
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};